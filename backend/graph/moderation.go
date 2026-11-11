package graph

import (
	"context"
	"errors"
	"log/slog"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// maxReasonLen bounds a moderation reason (the audit_log CHECK allows 500).
const maxReasonLen = 500

// tokenStateReader is the store lookup tokenGate needs; *store.Store has it.
type tokenStateReader interface {
	UserTokenState(ctx context.Context, userID string) (store.TokenState, error)
}

// tokenGate checks the access token of every mutation against the database
// (#224): a token whose version is behind (password changed, signed out
// everywhere, suspended, role changed) or whose account is suspended or gone
// is dropped, and the mutation runs as anonymous. Resolvers then refuse it
// with UNAUTHENTICATED, which clients answer by refreshing; the refresh fails
// for a suspended or signed-out account. Queries aren't checked: they cost one
// lookup each and expose nothing a 15-minute-old token couldn't already read
// (admin fields check the database themselves, see requireAdmin).
type tokenGate struct{ users tokenStateReader }

var _ interface {
	graphql.HandlerExtension
	graphql.OperationInterceptor
} = tokenGate{}

func (tokenGate) ExtensionName() string                   { return "TokenGate" }
func (tokenGate) Validate(graphql.ExecutableSchema) error { return nil }
func (g tokenGate) InterceptOperation(ctx context.Context, next graphql.OperationHandler) graphql.ResponseHandler {
	c := viewer(ctx)
	if c == nil || !graphql.HasOperationContext(ctx) {
		return next(ctx)
	}
	op := graphql.GetOperationContext(ctx).Operation
	if op == nil || op.Operation != ast.Mutation {
		return next(ctx)
	}
	st, err := g.users.UserTokenState(ctx, c.UserID)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return next(middleware.WithClaims(ctx, nil))
	case err != nil:
		// Fail closed: a write with an unverifiable token runs as anonymous.
		slog.ErrorContext(ctx, "token state lookup failed", "err", err)
		return next(middleware.WithClaims(ctx, nil))
	case !tokenCurrent(c, st):
		return next(middleware.WithClaims(ctx, nil))
	}
	return next(ctx)
}

// tokenCurrent reports whether claims still speak for the account: same token
// version and not suspended. The role isn't compared: opening a shop promotes a
// buyer to seller without a new token, and that only ever adds rights the shop
// ownership checks grant anyway. Admin grants and revokes bump the version.
func tokenCurrent(c *auth.Claims, st store.TokenState) bool {
	return !st.Suspended && c.TokenVersion == st.Version
}

// requireAdmin checks the viewer is an admin according to the database, not
// just the token, and returns the claims.
func (r *Resolver) requireAdmin(ctx context.Context) (*auth.Claims, error) {
	c, err := requireViewer(ctx)
	if err != nil {
		return nil, err
	}
	st, err := r.Store.UserTokenState(ctx, c.UserID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errUnauthenticated()
	}
	if err != nil {
		return nil, err
	}
	if !tokenCurrent(c, st) {
		return nil, errUnauthenticated()
	}
	if st.Role != string(model.UserRoleAdmin) {
		return nil, errForbidden("admins only")
	}
	return c, nil
}

// moderationReason validates the reason every admin action needs.
func moderationReason(reason string) (string, error) {
	return cleanText("reason", reason, 1, maxReasonLen)
}

// noChange maps store.ErrNoChange to the API's BAD_USER_INPUT.
func noChange(err error, msg string) error {
	if errors.Is(err, store.ErrNoChange) {
		return errBadInput("id", msg)
	}
	return err
}

func (r *Resolver) setUserSuspended(ctx context.Context, id, reason string, suspended bool) (*model.User, error) {
	c, err := r.requireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("user")
	}
	if reason, err = moderationReason(reason); err != nil {
		return nil, err
	}
	if suspended {
		if id == c.UserID {
			return nil, errBadInput("id", "you can't suspend yourself")
		}
		target, err := r.Store.UserByID(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			return nil, errNotFound("user")
		}
		if err != nil {
			return nil, err
		}
		if target.Role == string(model.UserRoleAdmin) {
			return nil, errForbidden("revoke the admin role first (cmd/admin)")
		}
	}
	err = r.Store.SetUserSuspended(ctx, c.UserID, id, suspended, reason)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("user")
	}
	if err != nil {
		return nil, noChange(err, "the account is already in that state")
	}
	u, err := r.Store.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toUser(u), nil
}

func (r *Resolver) setShopSuspended(ctx context.Context, id, reason string, suspended bool) (*model.Shop, error) {
	c, err := r.requireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("shop")
	}
	if reason, err = moderationReason(reason); err != nil {
		return nil, err
	}
	sh, err := r.Store.SetShopSuspended(ctx, c.UserID, id, suspended, reason)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("shop")
	}
	if err != nil {
		return nil, noChange(err, "the shop is already in that state")
	}
	return toShop(sh), nil
}

func (r *Resolver) adminUnpublishCoffee(ctx context.Context, id, reason string) (*model.Coffee, error) {
	c, err := r.requireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("coffee")
	}
	if reason, err = moderationReason(reason); err != nil {
		return nil, err
	}
	co, err := r.Store.AdminUnpublishCoffee(ctx, c.UserID, id, reason)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("coffee")
	}
	if err != nil {
		return nil, noChange(err, "the coffee is already a draft")
	}
	return toCoffee(co), nil
}

func (r *Resolver) adminUsers(ctx context.Context, search *string, limit, offset *int) (*model.UserConnection, error) {
	if _, err := r.requireAdmin(ctx); err != nil {
		return nil, err
	}
	var terms []string
	if search != nil {
		var err error
		if terms, err = searchTerms(*search); err != nil {
			return nil, err
		}
	}
	l, o := page(limit, offset)
	users, total, err := r.Store.AdminUsers(ctx, terms, l, o)
	if err != nil {
		return nil, err
	}
	nodes := make([]*model.User, len(users))
	for i, u := range users {
		nodes[i] = toUser(u)
	}
	return &model.UserConnection{Nodes: nodes, Total: total}, nil
}

func (r *Resolver) adminShops(ctx context.Context, search *string, limit, offset *int) (*model.ShopConnection, error) {
	if _, err := r.requireAdmin(ctx); err != nil {
		return nil, err
	}
	var terms []string
	if search != nil {
		var err error
		if terms, err = searchTerms(*search); err != nil {
			return nil, err
		}
	}
	l, o := page(limit, offset)
	shops, total, err := r.Store.AdminShops(ctx, terms, l, o)
	if err != nil {
		return nil, err
	}
	nodes := make([]*model.Shop, len(shops))
	for i, sh := range shops {
		nodes[i] = toShop(sh)
	}
	return &model.ShopConnection{Nodes: nodes, Total: total}, nil
}

func (r *Resolver) auditLog(ctx context.Context, limit, offset *int) (*model.AuditEntryConnection, error) {
	if _, err := r.requireAdmin(ctx); err != nil {
		return nil, err
	}
	l, o := page(limit, offset)
	rows, total, err := r.Store.AuditLog(ctx, l, o)
	if err != nil {
		return nil, err
	}
	nodes := make([]*model.AuditEntry, len(rows))
	for i, e := range rows {
		nodes[i] = &model.AuditEntry{
			ID: e.ID, ActorID: e.ActorID, Action: model.AuditAction(e.Action),
			TargetType: model.AuditTargetType(e.TargetType), TargetID: e.TargetID,
			Reason: e.Reason, CreatedAt: e.CreatedAt,
		}
	}
	return &model.AuditEntryConnection{Nodes: nodes, Total: total}, nil
}

// canSeeSuspension: the person concerned (the user, or the shop's owner) and
// admins see suspension flags; to anyone else they read false.
func canSeeSuspension(ctx context.Context, ownerID string) bool {
	c := viewer(ctx)
	return c != nil && (c.UserID == ownerID || isAdmin(c))
}
