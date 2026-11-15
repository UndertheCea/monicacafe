package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestPruneStaleCartLines (#291): lines untouched for 90 days go, newer ones
// stay; touching a line (any write) restarts its clock.
func TestPruneStaleCartLines(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 50)
	defer cleanup()
	db := s.RawDB()
	var buyers []string
	defer func() {
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, buyers)
	}()
	ages := []struct {
		name string
		age  time.Duration
		kept bool
	}{
		{"today", 0, true},
		{"89 days", 89 * 24 * time.Hour, true},
		{"91 days", 91 * 24 * time.Hour, false},
		{"two years", 2 * 365 * 24 * time.Hour, false},
	}
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	for i, a := range ages {
		u, err := s.CreateUser(ctx, fmt.Sprintf("prune-%s-%d@example.test", suffix, i), "x", "p")
		if err != nil {
			t.Fatal(err)
		}
		buyers = append(buyers, u.ID)
		if err := s.SetCartLine(ctx, u.ID, v.ID, 1, 450); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, `UPDATE cart_items SET updated_at = now() - $2::interval WHERE user_id = $1`,
			u.ID, fmt.Sprintf("%d seconds", int64(a.age.Seconds()))); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.PruneStaleCartLines(ctx, store.CartLineMaxAge, 1000); err != nil {
		t.Fatal(err)
	}
	for i, a := range ages {
		lines, err := s.CartLines(ctx, buyers[i])
		if err != nil {
			t.Fatal(err)
		}
		if kept := len(lines) == 1; kept != a.kept {
			t.Errorf("%s: kept = %v, want %v", a.name, kept, a.kept)
		}
	}
}
