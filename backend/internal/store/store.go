// Package store is the PostgreSQL data-access layer for Moni Cafe.
//
// All SQL lives here; resolvers never build queries themselves. Methods return
// plain domain structs (see types.go) and the sentinel errors below so callers
// can map failures to API error codes without inspecting driver errors.
package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrNotFound is returned when a requested row does not exist.
	ErrNotFound = errors.New("store: not found")
	// ErrConflict is returned when a unique constraint is violated.
	ErrConflict = errors.New("store: conflict")
	// ErrInvalidReference is returned when a foreign key points at a missing row.
	ErrInvalidReference = errors.New("store: invalid reference")
	// ErrRefreshReuse is returned when a revoked refresh token is presented
	// again outside the rotation grace window (possible theft).
	ErrRefreshReuse = errors.New("store: refresh token reuse")
	// ErrOwnsShop is returned when deleting an account that owns a shop.
	ErrOwnsShop = errors.New("store: account owns a shop")
	// ErrStockChanged is returned when a stock edit carried the stock the
	// seller last saw and the row no longer has it (an order took some, #277).
	ErrStockChanged = errors.New("store: stock changed")
	// ErrInsufficientStock is returned when ReserveStock can't take n units:
	// too few left, the variant is unavailable, archived or missing.
	ErrInsufficientStock = errors.New("store: insufficient stock")
)

// DB is the subset of pgx used by the store; satisfied by *pgxpool.Pool and pgx.Tx.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store provides typed access to the database.
type Store struct {
	pool *pgxpool.Pool
	db   DB
}

// New wraps a connection pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, db: pool}
}

// InTx runs fn inside a transaction. The Store passed to fn issues all of its
// queries on that transaction. The transaction is committed if fn returns nil.
func (s *Store) InTx(ctx context.Context, fn func(tx *Store) error) error {
	if s.pool == nil {
		// Already inside a transaction: run inline.
		return fn(s)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(&Store{db: tx}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// mapErr converts driver errors into store sentinel errors.
func mapErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return &ConstraintError{Kind: ErrConflict, Constraint: pgErr.ConstraintName}
		case "23503": // foreign_key_violation
			return &ConstraintError{Kind: ErrInvalidReference, Constraint: pgErr.ConstraintName}
		case "22P02": // invalid_text_representation (e.g. malformed UUID)
			return ErrNotFound
		}
	}
	return err
}

// ConstraintError reports which database constraint rejected a write.
// errors.Is(err, ErrConflict) / errors.Is(err, ErrInvalidReference) match it.
type ConstraintError struct {
	Kind       error
	Constraint string
}

func (e *ConstraintError) Error() string { return fmt.Sprintf("%v (%s)", e.Kind, e.Constraint) }
func (e *ConstraintError) Unwrap() error { return e.Kind }

// ViolatedConstraint returns the constraint name behind a conflict or
// invalid-reference error, or "" if err is not a constraint error.
func ViolatedConstraint(err error) string {
	var ce *ConstraintError
	if errors.As(err, &ce) {
		return ce.Constraint
	}
	return ""
}
