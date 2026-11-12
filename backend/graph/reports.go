package graph

import (
	"context"
	"errors"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/platform/twfmt"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// maxReportNote bounds the optional note on a report (the reports CHECK allows 500).
const maxReportNote = 500

// errContactInfo refuses new text that carries a phone number, email, link or
// social handle (#225).
func errContactInfo(field string) error {
	return &apiError{code: CodeContactInfo, message: field + " can't contain phone numbers, emails, links or LINE / IG / FB IDs", field: field}
}

// noContactInfo checks newly written text (comments, shop and coffee
// descriptions). Stored text is never re-checked or rewritten: callers skip
// this when the text is unchanged.
func noContactInfo(field, text string) error {
	if twfmt.ContainsContactInfo(text) {
		return errContactInfo(field)
	}
	return nil
}

// noNewContactInfo is noContactInfo for an optional update: nil (not being
// changed) and text equal to what is stored both pass.
func noNewContactInfo(field string, text *string, stored string) error {
	if text == nil || *text == stored {
		return nil
	}
	return noContactInfo(field, *text)
}

// reportOutcome maps an admin's resolution to the status the report gets and
// whether the target is taken down.
func reportOutcome(action model.ReportResolution) (status string, remove bool, ok bool) {
	switch action {
	case model.ReportResolutionDismiss:
		return store.ReportDismissed, false, true
	case model.ReportResolutionActioned:
		return store.ReportActioned, false, true
	case model.ReportResolutionRemove:
		return store.ReportActioned, true, true
	}
	return "", false, false
}

func toReport(r *store.Report) *model.Report {
	return &model.Report{
		ID: r.ID, ReporterID: r.ReporterID, TargetType: model.ReportTargetType(r.TargetType), TargetID: r.TargetID,
		Reason: model.ReportReason(r.Reason), Note: r.Note, Status: model.ReportStatus(r.Status),
		HandledByID: r.HandledBy, HandledAt: r.HandledAt, CreatedAt: r.CreatedAt,
	}
}

// report files a visitor's report after checking the target exists and the
// reporter can see it.
func (r *Resolver) report(ctx context.Context, targetType model.ReportTargetType, targetID string, reason model.ReportReason, note *string) (bool, error) {
	c, err := requireViewer(ctx)
	if err != nil {
		return false, err
	}
	if !targetType.IsValid() || !reason.IsValid() {
		return false, errBadInput("reason", "unknown report type or reason")
	}
	text := ""
	if note != nil {
		if text, err = cleanMultiline("note", *note, 0, maxReportNote); err != nil {
			return false, err
		}
	}
	if !isUUID(targetID) {
		return false, errNotFound(lowerTarget(targetType))
	}
	visible, err := r.reportTargetVisible(ctx, targetType, targetID)
	if err != nil {
		return false, err
	}
	if !visible {
		return false, errNotFound(lowerTarget(targetType))
	}
	// Spent only by valid reports, like comments.
	if err := allowKey(r.Limits.ReportUser, c.UserID); err != nil {
		return false, err
	}
	err = r.Store.CreateReport(ctx, c.UserID, string(targetType), targetID, string(reason), text)
	if errors.Is(err, store.ErrInvalidReference) {
		return false, errUnauthenticated() // the reporter's account is gone
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func lowerTarget(t model.ReportTargetType) string {
	switch t {
	case model.ReportTargetTypeComment:
		return "comment"
	case model.ReportTargetTypeShop:
		return "shop"
	}
	return "coffee"
}

// reportTargetVisible: the target exists and is something the viewer can see
// on the site: a public shop, a public coffee (or a draft they may see), or a
// comment by an active account on such a coffee.
func (r *Resolver) reportTargetVisible(ctx context.Context, targetType model.ReportTargetType, id string) (bool, error) {
	coffeeVisible := func(coffeeID string) (bool, error) {
		co, err := r.Store.CoffeeByID(ctx, coffeeID)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if co.Public() {
			return true, nil
		}
		return r.canSeeDrafts(ctx, co.ShopID)
	}
	switch targetType {
	case model.ReportTargetTypeShop:
		sh, err := r.Store.ShopByID(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		return sh.SuspendedAt == nil, nil
	case model.ReportTargetTypeCoffee:
		return coffeeVisible(id)
	case model.ReportTargetTypeComment:
		cm, err := r.Store.CommentByID(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		author, err := r.Store.UserByID(ctx, cm.UserID)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if author.SuspendedAt != nil {
			return false, nil
		}
		return coffeeVisible(cm.CoffeeID)
	}
	return false, nil
}

func (r *Resolver) reports(ctx context.Context, status *model.ReportStatus, limit, offset *int) (*model.ReportConnection, error) {
	if _, err := r.requireAdmin(ctx); err != nil {
		return nil, err
	}
	st := model.ReportStatusOpen
	if status != nil {
		if !status.IsValid() {
			return nil, errBadInput("status", "unknown report status")
		}
		st = *status
	}
	l, o := page(limit, offset)
	rows, total, err := r.Store.Reports(ctx, string(st), l, o)
	if err != nil {
		return nil, err
	}
	nodes := make([]*model.Report, len(rows))
	for i, rep := range rows {
		nodes[i] = toReport(rep)
	}
	return &model.ReportConnection{Nodes: nodes, Total: total}, nil
}

func (r *Resolver) resolveReport(ctx context.Context, id string, action model.ReportResolution, reason *string) (*model.Report, error) {
	c, err := r.requireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("report")
	}
	status, remove, ok := reportOutcome(action)
	if !ok {
		return nil, errBadInput("action", "unknown resolution")
	}
	why := ""
	if remove {
		// Taking something down needs a reason, like every admin action.
		if reason == nil {
			return nil, errBadInput("reason", "reason is required")
		}
		if why, err = moderationReason(*reason); err != nil {
			return nil, err
		}
	} else if reason != nil {
		if why, err = cleanText("reason", *reason, 0, maxReasonLen); err != nil {
			return nil, err
		}
	}
	var takeDown func(tx *store.Store) error
	if remove {
		rep, err := r.Store.ReportByID(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			return nil, errNotFound("report")
		}
		if err != nil {
			return nil, err
		}
		takeDown = func(tx *store.Store) error {
			switch rep.TargetType {
			case store.AuditComment:
				return tx.AdminDeleteComment(ctx, c.UserID, rep.TargetID, why)
			case store.AuditCoffee:
				_, err := tx.AdminUnpublishCoffee(ctx, c.UserID, rep.TargetID, why)
				return err
			case store.AuditShop:
				_, err := tx.SetShopSuspended(ctx, c.UserID, rep.TargetID, true, why)
				return err
			}
			return nil
		}
	}
	rep, err := r.Store.ResolveReport(ctx, c.UserID, id, status, why, takeDown)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("report")
	}
	if err != nil {
		return nil, noChange(err, "the report is already closed")
	}
	return toReport(rep), nil
}

// reportUser resolves Report.reporter / Report.handledBy: nil for a deleted account.
func (r *Resolver) reportUser(ctx context.Context, id *string) (*model.User, error) {
	if id == nil {
		return nil, nil
	}
	u, err := r.loadersFor(ctx).UserByID.Load(ctx, *id)
	if isLoaderNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toUser(u), nil
}

func (r *Resolver) reportComment(ctx context.Context, obj *model.Report) (*model.Comment, error) {
	if obj.TargetType != model.ReportTargetTypeComment {
		return nil, nil
	}
	cm, err := r.Store.CommentByID(ctx, obj.TargetID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toComment(cm), nil
}

func (r *Resolver) reportShop(ctx context.Context, obj *model.Report) (*model.Shop, error) {
	if obj.TargetType != model.ReportTargetTypeShop {
		return nil, nil
	}
	sh, err := r.loadersFor(ctx).ShopByID.Load(ctx, obj.TargetID)
	if isLoaderNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toShop(sh), nil
}

func (r *Resolver) reportCoffee(ctx context.Context, obj *model.Report) (*model.Coffee, error) {
	if obj.TargetType != model.ReportTargetTypeCoffee {
		return nil, nil
	}
	co, err := r.loadersFor(ctx).CoffeeByID.Load(ctx, obj.TargetID)
	if isLoaderNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toCoffee(co), nil
}
