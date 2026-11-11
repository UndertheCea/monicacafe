package store

import (
	"context"
	"errors"
	"time"
)

// ErrUploadQuota is returned by ReserveUpload when granting the upload would
// take the shop past its budget for the window.
var ErrUploadQuota = errors.New("store: upload quota exceeded")

// UploadWindow is how far back ReserveUpload counts earlier presigns (the SQL
// below hardcodes the same 24 hours).
const UploadWindow = 24 * time.Hour

// ReserveUpload records a presigned upload of bytes for shopID, unless the
// shop's presigns in the last UploadWindow plus bytes would exceed budget
// (ErrUploadQuota). A budget of 0 or less means unlimited and records nothing.
// A per-shop advisory lock makes check and insert atomic, and rows older than
// the window are deleted on the way, so no separate pruning job is needed.
func (s *Store) ReserveUpload(ctx context.Context, shopID string, bytes, budget int64) error {
	if budget <= 0 {
		return nil
	}
	return s.InTx(ctx, func(tx *Store) error {
		if _, err := tx.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "upload_grants:"+shopID); err != nil {
			return mapErr(err)
		}
		if _, err := tx.db.Exec(ctx,
			`DELETE FROM upload_grants WHERE shop_id = $1 AND created_at < now() - interval '24 hours'`,
			shopID); err != nil {
			return mapErr(err)
		}
		var used int64
		if err := tx.db.QueryRow(ctx,
			`SELECT COALESCE(sum(bytes), 0) FROM upload_grants WHERE shop_id = $1`, shopID).Scan(&used); err != nil {
			return mapErr(err)
		}
		if used+bytes > budget {
			return ErrUploadQuota
		}
		_, err := tx.db.Exec(ctx, `INSERT INTO upload_grants (shop_id, bytes) VALUES ($1, $2)`, shopID, bytes)
		return mapErr(err)
	})
}
