package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestSetCartLineQuantity (#379): a quantity change keeps the line's price
// snapshot (one accepted by another tab isn't written back) and refuses a
// line that isn't the buyer's or is gone.
func TestSetCartLineQuantity(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 50)
	defer cleanup()
	db := s.RawDB()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	var users []string
	defer func() {
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, users)
	}()
	newBuyer := func(name string) string {
		u, err := s.CreateUser(ctx, fmt.Sprintf("qty-%s-%s@example.test", name, suffix), "x", "p")
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, u.ID)
		if err := s.SetCartLine(ctx, u.ID, v.ID, 1, 450); err != nil {
			t.Fatal(err)
		}
		return u.ID
	}
	lineOf := func(userID string) *store.CartLine {
		lines, err := s.CartLines(ctx, userID)
		if err != nil || len(lines) != 1 {
			t.Fatalf("lines = %v, %v", lines, err)
		}
		return lines[0]
	}

	cases := []struct {
		name    string
		run     func(buyer, other string) error
		wantErr error
		want    int64 // snapshot after
		wantQty int
	}{
		{"keeps the snapshot", func(b, _ string) error {
			return s.SetCartLineQuantity(ctx, b, lineOf(b).ID, 3)
		}, nil, 450, 3},
		{"keeps a price accepted meanwhile", func(b, _ string) error {
			id := lineOf(b).ID
			if _, err := db.Exec(ctx, `UPDATE cart_items SET price_twd = 500 WHERE id = $1`, id); err != nil {
				return err
			}
			return s.SetCartLineQuantity(ctx, b, id, 2)
		}, nil, 500, 2},
		{"another buyer's line", func(b, o string) error {
			return s.SetCartLineQuantity(ctx, o, lineOf(b).ID, 5)
		}, store.ErrNotFound, 450, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			buyer, other := newBuyer("b"+fmt.Sprint(len(users))), newBuyer("o"+fmt.Sprint(len(users)))
			if err := tc.run(buyer, other); !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			l := lineOf(buyer)
			if l.AddedPriceTWD != tc.want || l.Quantity != tc.wantQty {
				t.Fatalf("line = qty %d @ %d, want qty %d @ %d", l.Quantity, l.AddedPriceTWD, tc.wantQty, tc.want)
			}
		})
	}

	t.Run("removed line", func(t *testing.T) {
		b := newBuyer("gone")
		id := lineOf(b).ID
		if err := s.DeleteCartLine(ctx, b, id); err != nil {
			t.Fatal(err)
		}
		if err := s.SetCartLineQuantity(ctx, b, id, 2); !errors.Is(err, store.ErrNotFound) {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
		if lines, _ := s.CartLines(ctx, b); len(lines) != 0 {
			t.Fatalf("line came back: %v", lines)
		}
	})
}
