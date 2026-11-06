package db

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Options tune the pool. They override anything the DSN sets.
type Options struct {
	// MaxConns caps open connections; 0 keeps pgx's default.
	MaxConns int32
	// StatementTimeout is sent as Postgres' statement_timeout on every
	// connection, so one slow query can't hold a connection indefinitely;
	// 0 leaves the server default (normally no timeout).
	StatementTimeout time.Duration
}

func New(ctx context.Context, dsn string, opts Options) (*pgxpool.Pool, error) {
	cfg, err := poolConfig(dsn, opts)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

func poolConfig(dsn string, opts Options) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	if opts.MaxConns > 0 {
		cfg.MaxConns = opts.MaxConns
		if cfg.MinConns > cfg.MaxConns {
			cfg.MinConns = cfg.MaxConns
		}
	}
	if opts.StatementTimeout > 0 {
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = strconv.FormatInt(opts.StatementTimeout.Milliseconds(), 10)
	}
	return cfg, nil
}
