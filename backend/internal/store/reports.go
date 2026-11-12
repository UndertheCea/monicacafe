package store

import (
	"context"
	"errors"
	"time"
)

// Report statuses (#225), as the reports CHECK constraint allows them.
const (
	ReportOpen      = "OPEN"
	ReportActioned  = "ACTIONED"
	ReportDismissed = "DISMISSED"
)

// Audit actions for closing a report.
const (
	AuditDismissReport = "DISMISS_REPORT"
	AuditActionReport  = "ACTION_REPORT"
)

// Report is a visitor's report of a comment, shop or coffee. ReporterID and
// HandledBy are nil once those accounts are deleted (and HandledBy while open).
type Report struct {
	ID         string
	ReporterID *string
	TargetType string // COMMENT | SHOP | COFFEE (the audit target types)
	TargetID   string
	Reason     string
	Note       string
	Status     string
	HandledBy  *string
	HandledAt  *time.Time
	CreatedAt  time.Time
}

const reportColumns = `id, reporter_id, target_type, target_id, reason, note, status, handled_by, handled_at, created_at`

func scanReport(row interface{ Scan(...any) error }) (*Report, error) {
	var r Report
	if err := row.Scan(&r.ID, &r.ReporterID, &r.TargetType, &r.TargetID, &r.Reason, &r.Note, &r.Status,
		&r.HandledBy, &r.HandledAt, &r.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	return &r, nil
}

// CreateReport files a report. A second report by the same person on the same
// target while the first is still open changes nothing (and isn't an error).
func (s *Store) CreateReport(ctx context.Context, reporterID, targetType, targetID, reason, note string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, note) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'OPEN' DO NOTHING`,
		reporterID, targetType, targetID, reason, note)
	return mapErr(err)
}

// ReportByID fetches one report.
func (s *Store) ReportByID(ctx context.Context, id string) (*Report, error) {
	return scanReport(s.db.QueryRow(ctx, `SELECT `+reportColumns+` FROM reports WHERE id = $1`, id))
}

// Reports lists a page of reports with this status, newest first, plus the total.
func (s *Store) Reports(ctx context.Context, status string, limit, offset int) ([]*Report, int, error) {
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM reports WHERE status = $1`, status).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `SELECT `+reportColumns+` FROM reports WHERE status = $1
		ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, status, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*Report{}
	for rows.Next() {
		r, err := scanReport(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, total, mapErr(rows.Err())
}

// ResolveReport closes an open report, and every other open report on the
// same target, as status (ACTIONED or DISMISSED), and records it. When remove
// is set the target is taken down first, in the same transaction; a target
// that is already gone or already down (ErrNotFound / ErrNoChange) still
// closes the report. ErrNotFound for an unknown report, ErrNoChange when it
// was already closed.
func (s *Store) ResolveReport(ctx context.Context, actorID, reportID, status, reason string, remove func(tx *Store) error) (*Report, error) {
	var out *Report
	err := s.InTx(ctx, func(tx *Store) error {
		rep, err := scanReport(tx.db.QueryRow(ctx, `SELECT `+reportColumns+` FROM reports WHERE id = $1 FOR UPDATE`, reportID))
		if err != nil {
			return err
		}
		if rep.Status != ReportOpen {
			return ErrNoChange
		}
		if remove != nil {
			if err := remove(tx); err != nil && !errors.Is(err, ErrNotFound) && !errors.Is(err, ErrNoChange) {
				return err
			}
		}
		if _, err := tx.db.Exec(ctx, `
			UPDATE reports SET status = $3, handled_by = $4, handled_at = now()
			WHERE target_type = $1 AND target_id = $2 AND status = 'OPEN'`,
			rep.TargetType, rep.TargetID, status, actorID); err != nil {
			return mapErr(err)
		}
		action := AuditActionReport
		if status == ReportDismissed {
			action = AuditDismissReport
		}
		if err := tx.Audit(ctx, AuditEntry{ActorID: &actorID, Action: action, TargetType: rep.TargetType, TargetID: rep.TargetID, Reason: reason}); err != nil {
			return err
		}
		out, err = tx.ReportByID(ctx, reportID)
		return err
	})
	return out, err
}
