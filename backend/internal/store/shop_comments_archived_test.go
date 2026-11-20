package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestShopCommentsSkipArchivedCoffees (#432): a coffee archived because an order
// or hold references it disappears from the seller's comment inbox and its
// total; the author's own list keeps the comment.
func TestShopCommentsSkipArchivedCoffees(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	err := s.InTx(ctx, func(tx *store.Store) error {
		shops := seedShops(t, ctx, tx, suffix, []struct {
			name              string
			published, drafts int
		}{{"arc" + suffix, 2, 0}})
		shopID := shops[0]
		list, _, err := tx.ListCoffees(ctx, store.CoffeeFilter{ShopID: &shopID}, store.SortNewest, 10, 0)
		if err != nil || len(list) != 2 {
			t.Fatalf("coffees: %v (%d)", err, len(list))
		}
		u, err := tx.CreateUser(ctx, "arc-"+suffix+"@example.test", "x", "a")
		if err != nil {
			return err
		}
		for _, co := range list {
			if _, err := tx.CreateComment(ctx, u.ID, co.ID, "好喝"); err != nil {
				return err
			}
		}
		check := func(name string, wantShop int) {
			t.Helper()
			got, total, err := tx.CommentsByShop(ctx, shopID, 10, 0)
			if err != nil || total != wantShop || len(got) != wantShop {
				t.Fatalf("%s: shop inbox %d of %d (%v), want %d", name, len(got), total, err, wantShop)
			}
			_, mine, err := tx.CommentsByUser(ctx, u.ID, 10, 0)
			if err != nil || mine != 2 {
				t.Fatalf("%s: author's list = %d (%v), want 2", name, mine, err)
			}
		}
		check("both live", 2)
		if _, err := tx.RawDB().Exec(ctx, `UPDATE coffees SET archived_at = now(), is_published = false WHERE id = $1`, list[0].ID); err != nil {
			return err
		}
		check("one archived", 1)
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
