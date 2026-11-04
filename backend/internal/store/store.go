// Package store holds the raw pgx queries behind the GraphQL resolvers.
// Stage 1 uses hand-written SQL on a *pgxpool.Pool (sqlc may replace this
// later). All IDs are UUIDs, cast to text at the SQL boundary.
package store

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned by single-row lookups that match nothing.
var ErrNotFound = errors.New("store: not found")

// Store wraps the connection pool.
type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const (
	DefaultLimit = 20
	MaxLimit     = 100
)

// Page normalises optional GraphQL limit/offset arguments:
// nil or <=0 limit → DefaultLimit, capped at MaxLimit; negative offset → 0.
func Page(limit, offset *int) (int, int) {
	l, o := DefaultLimit, 0
	if limit != nil && *limit > 0 {
		l = min(*limit, MaxLimit)
	}
	if offset != nil && *offset > 0 {
		o = *offset
	}
	return l, o
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
