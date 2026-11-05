package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// QueryRowForTest lets external tests inspect rows the store has no reader for.
func (s *Store) QueryRowForTest(ctx context.Context, sql string, args ...any) pgx.Row {
	return s.db.QueryRow(ctx, sql, args...)
}
