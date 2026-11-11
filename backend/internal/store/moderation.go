package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Audit actions (#224). Stored as text; the GraphQL enum mirrors them.
const (
	AuditSuspendUser     = "SUSPEND_USER"
	AuditUnsuspendUser   = "UNSUSPEND_USER"
	AuditSuspendShop     = "SUSPEND_SHOP"
	AuditUnsuspendShop   = "UNSUSPEND_SHOP"
	AuditUnpublishCoffee = "UNPUBLISH_COFFEE"
	AuditDeleteComment   = "DELETE_COMMENT"
	AuditDeleteAccount   = "DELETE_ACCOUNT"
	AuditChangePassword  = "CHANGE_PASSWORD"
	AuditGrantAdmin      = "GRANT_ADMIN"
	AuditRevokeAdmin     = "REVOKE_ADMIN"
)

// Audit target types, as the audit_log CHECK constraint allows them.
const (
	AuditUser    = "USER"
	AuditShop    = "SHOP"
	AuditCoffee  = "COFFEE"
	AuditComment = "COMMENT"
)

// ErrNoChange is returned when a moderation action would change nothing (the
// user is already suspended, the role is already set, …).
var ErrNoChange = errors.New("store: nothing to change")

// AuditEntry is one row of the append-only audit log. ActorID is nil for the
// admin CLI and once the actor's account has been deleted.
type AuditEntry struct {
	ID         string
	ActorID    *string
	Action     string
	TargetType string
	TargetID   string
	Reason     string
	CreatedAt  time.Time
}

// Audit records an action. Call it on the transaction that performs the action,
// so the record and the change commit (or fail) together.
func (s *Store) Audit(ctx context.Context, e AuditEntry) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO audit_log (actor_id, action, target_type, target_id, reason) VALUES ($1, $2, $3, $4, $5)`,
		e.ActorID, e.Action, e.TargetType, e.TargetID, e.Reason)
	return mapErr(err)
}

// AuditLog lists a page of the audit log, newest first, plus the total.
func (s *Store) AuditLog(ctx context.Context, limit, offset int) ([]*AuditEntry, int, error) {
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM audit_log`).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, actor_id, action, target_type, target_id, reason, created_at FROM audit_log
		ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*AuditEntry{}
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Action, &e.TargetType, &e.TargetID, &e.Reason, &e.CreatedAt); err != nil {
			return nil, 0, mapErr(err)
		}
		out = append(out, &e)
	}
	return out, total, mapErr(rows.Err())
}

// SetUserSuspended suspends (or reinstates) an account and records it. A
// suspension also ends every session and bumps the token version, so the
// account can't write again even with an access token it already holds.
// ErrNotFound for an unknown user, ErrNoChange when it is already in that state.
func (s *Store) SetUserSuspended(ctx context.Context, actorID, userID string, suspended bool, reason string) error {
	return s.InTx(ctx, func(tx *Store) error {
		tag, err := tx.db.Exec(ctx, `
			UPDATE users SET suspended_at = CASE WHEN $2 THEN now() END
			WHERE id = $1 AND (suspended_at IS NOT NULL) <> $2`, userID, suspended)
		if err != nil {
			return mapErr(err)
		}
		if tag.RowsAffected() == 0 {
			return tx.existsOrNoChange(ctx, "users", userID)
		}
		action := AuditUnsuspendUser
		if suspended {
			action = AuditSuspendUser
			if err := tx.RevokeUserRefreshTokens(ctx, userID); err != nil {
				return err
			}
		}
		return tx.Audit(ctx, AuditEntry{ActorID: &actorID, Action: action, TargetType: AuditUser, TargetID: userID, Reason: reason})
	})
}

// SetShopSuspended suspends (or reinstates) a shop and records it. A suspended
// shop and all its coffees drop out of every public query (see publicCoffee).
func (s *Store) SetShopSuspended(ctx context.Context, actorID, shopID string, suspended bool, reason string) (*Shop, error) {
	var sh *Shop
	err := s.InTx(ctx, func(tx *Store) error {
		var err error
		sh, err = scanShop(tx.db.QueryRow(ctx, `
			UPDATE shops SET suspended_at = CASE WHEN $2 THEN now() END
			WHERE id = $1 AND (suspended_at IS NOT NULL) <> $2
			RETURNING `+shopColumns, shopID, suspended))
		if errors.Is(err, ErrNotFound) {
			return tx.existsOrNoChange(ctx, "shops", shopID)
		}
		if err != nil {
			return err
		}
		action := AuditUnsuspendShop
		if suspended {
			action = AuditSuspendShop
		}
		return tx.Audit(ctx, AuditEntry{ActorID: &actorID, Action: action, TargetType: AuditShop, TargetID: shopID, Reason: reason})
	})
	return sh, err
}

// AdminUnpublishCoffee takes a published coffee offline and records it.
// ErrNoChange when it is already a draft.
func (s *Store) AdminUnpublishCoffee(ctx context.Context, actorID, coffeeID, reason string) (*Coffee, error) {
	var co *Coffee
	err := s.InTx(ctx, func(tx *Store) error {
		var err error
		co, err = scanCoffee(tx.db.QueryRow(ctx, `
			WITH c AS (UPDATE coffees SET is_published = false WHERE id = $1 AND is_published RETURNING *)
			SELECT `+coffeeColumns+` FROM c`, coffeeID))
		if errors.Is(err, ErrNotFound) {
			return tx.existsOrNoChange(ctx, "coffees", coffeeID)
		}
		if err != nil {
			return err
		}
		return tx.Audit(ctx, AuditEntry{ActorID: &actorID, Action: AuditUnpublishCoffee, TargetType: AuditCoffee, TargetID: coffeeID, Reason: reason})
	})
	return co, err
}

// AdminDeleteComment deletes someone else's comment and records it.
func (s *Store) AdminDeleteComment(ctx context.Context, actorID, commentID, reason string) error {
	return s.InTx(ctx, func(tx *Store) error {
		if err := tx.DeleteComment(ctx, commentID); err != nil {
			return err
		}
		return tx.Audit(ctx, AuditEntry{ActorID: &actorID, Action: AuditDeleteComment, TargetType: AuditComment, TargetID: commentID, Reason: reason})
	})
}

// SetAdminRole grants or revokes ADMIN for the account with this email (the
// admin CLI, so there is no actor). Revoking returns the account to SELLER when
// it owns a shop, else BUYER. The token version is bumped either way, so a
// token carrying the old role stops working for writes.
func (s *Store) SetAdminRole(ctx context.Context, email string, admin bool) (*User, error) {
	var u *User
	err := s.InTx(ctx, func(tx *Store) error {
		var err error
		u, err = scanUser(tx.db.QueryRow(ctx, `
			UPDATE users SET
				role = CASE WHEN $2 THEN 'ADMIN'::user_role
					WHEN EXISTS (SELECT 1 FROM shops WHERE owner_id = users.id) THEN 'SELLER'::user_role
					ELSE 'BUYER'::user_role END,
				token_version = token_version + 1
			WHERE email = $1 AND (role = 'ADMIN') <> $2
			RETURNING `+userColumns, email, admin))
		if errors.Is(err, ErrNotFound) {
			var exists bool
			if err := tx.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
				return mapErr(err)
			}
			if exists {
				return ErrNoChange
			}
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		action := AuditRevokeAdmin
		if admin {
			action = AuditGrantAdmin
		}
		return tx.Audit(ctx, AuditEntry{Action: action, TargetType: AuditUser, TargetID: u.ID})
	})
	return u, err
}

// existsOrNoChange tells an unknown id (ErrNotFound) from a row that is already
// in the requested state (ErrNoChange). table is a constant from this package.
func (s *Store) existsOrNoChange(ctx context.Context, table, id string) error {
	var exists bool
	if err := s.db.QueryRow(ctx, fmt.Sprintf(`SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)`, table), id).Scan(&exists); err != nil {
		return mapErr(err)
	}
	if exists {
		return ErrNoChange
	}
	return ErrNotFound
}

// AdminUsers lists accounts for the admin screen, newest first: every account
// (suspended ones included) whose email or display name contains each term.
func (s *Store) AdminUsers(ctx context.Context, terms []string, limit, offset int) ([]*User, int, error) {
	where, args := adminSearch(terms, "email::text", "display_name")
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM users`+where, args...).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	n := len(args)
	rows, err := s.db.Query(ctx, fmt.Sprintf(`SELECT %s FROM users%s
		ORDER BY created_at DESC, id LIMIT $%d OFFSET $%d`, userColumns, where, n+1, n+2),
		append(args, limit, offset)...)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, mapErr(rows.Err())
}

// AdminShops lists shops for the admin screen, newest first: every shop
// (suspended and empty ones included) whose name or slug contains each term.
func (s *Store) AdminShops(ctx context.Context, terms []string, limit, offset int) ([]*Shop, int, error) {
	where, args := adminSearch(terms, "name", "slug")
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM shops`+where, args...).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	n := len(args)
	rows, err := s.db.Query(ctx, fmt.Sprintf(`SELECT %s FROM shops%s
		ORDER BY created_at DESC, id LIMIT $%d OFFSET $%d`, shopColumns, where, n+1, n+2),
		append(args, limit, offset)...)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*Shop{}
	for rows.Next() {
		sh, err := scanShop(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, sh)
	}
	return out, total, mapErr(rows.Err())
}

// adminSearch builds " WHERE …" requiring every term in one of two columns.
func adminSearch(terms []string, colA, colB string) (string, []any) {
	if len(terms) == 0 {
		return "", nil
	}
	conds := make([]string, len(terms))
	args := make([]any, len(terms))
	for i, t := range terms {
		args[i] = LikePattern(t)
		conds[i] = fmt.Sprintf("(%s ILIKE $%d OR %s ILIKE $%d)", colA, i+1, colB, i+1)
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}
