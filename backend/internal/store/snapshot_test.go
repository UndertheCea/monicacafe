package store_test

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// sqlRecorder is a pgx query tracer that remembers every statement in order.
type sqlRecorder struct {
	mu  sync.Mutex
	sql []string
}

func (r *sqlRecorder) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	r.mu.Lock()
	r.sql = append(r.sql, strings.ToLower(strings.Join(strings.Fields(d.SQL), " ")))
	r.mu.Unlock()
	return ctx
}

func (r *sqlRecorder) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (r *sqlRecorder) reset() {
	r.mu.Lock()
	r.sql = nil
	r.mu.Unlock()
}

func (r *sqlRecorder) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.sql...)
}

// Every count + page listing runs both statements in one REPEATABLE READ,
// read-only transaction, so the total and the nodes agree (#418, #440). Inside
// a transaction already, no second one is opened.
func TestCountAndPageListingsUseOneSnapshot(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	rec := &sqlRecorder{}
	cfg.ConnConfig.Tracer = rec
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := store.New(pool)

	const id = "00000000-0000-4000-8000-000000000440"
	tests := []struct {
		name string
		call func(s *store.Store) error
	}{
		{"SavedCoffeesByUser", func(s *store.Store) error { _, _, err := s.SavedCoffeesByUser(ctx, id, 5, 0); return err }},
		{"FollowedShopsByUser", func(s *store.Store) error { _, _, err := s.FollowedShopsByUser(ctx, id, 5, 0); return err }},
		{"FollowingCoffees", func(s *store.Store) error { _, _, err := s.FollowingCoffees(ctx, id, 5, 0); return err }},
		{"CommentsByUser", func(s *store.Store) error { _, _, err := s.CommentsByUser(ctx, id, 5, 0); return err }},
		{"CommentsByShop", func(s *store.Store) error { _, _, err := s.CommentsByShop(ctx, id, 5, 0); return err }},
		{"Reports", func(s *store.Store) error { _, _, err := s.Reports(ctx, store.ReportOpen, 5, 0); return err }},
		{"AuditLog", func(s *store.Store) error { _, _, err := s.AuditLog(ctx, 5, 0); return err }},
		{"AdminUsers", func(s *store.Store) error { _, _, err := s.AdminUsers(ctx, []string{"x"}, 5, 0); return err }},
		{"AdminShops", func(s *store.Store) error { _, _, err := s.AdminShops(ctx, nil, 5, 0); return err }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec.reset()
			if err := tc.call(s); err != nil {
				t.Fatal(err)
			}
			got := rec.snapshot()
			if len(got) != 4 {
				t.Fatalf("statements = %q, want begin, count, page, commit", got)
			}
			if !strings.HasPrefix(got[0], "begin") || !strings.Contains(got[0], "repeatable read") || !strings.Contains(got[0], "read only") {
				t.Errorf("first statement = %q, want a REPEATABLE READ READ ONLY begin", got[0])
			}
			if !strings.Contains(got[1], "count(*)") || strings.Contains(got[2], "count(*)") {
				t.Errorf("middle statements = %q, want the count then the page", got[1:3])
			}
			if got[3] != "commit" {
				t.Errorf("last statement = %q, want commit", got[3])
			}

			// Inside a transaction already: it runs inline, no second begin.
			rec.reset()
			err := s.InTx(ctx, func(tx *store.Store) error { return tc.call(tx) })
			if err != nil {
				t.Fatalf("in a transaction: %v", err)
			}
			begins := 0
			for _, q := range rec.snapshot() {
				if strings.HasPrefix(q, "begin") {
					begins++
				}
			}
			if begins != 1 {
				t.Errorf("begins in InTx = %d, want 1", begins)
			}
		})
	}
}
