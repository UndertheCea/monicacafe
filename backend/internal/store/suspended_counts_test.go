package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestSuspendedUsersDontCount (#327): saves and follows by suspended accounts
// are left out of the public counts and the "Most saved" / "Most followed"
// sorts, like their comments; lifting the suspension brings them back.
func TestSuspendedUsersDontCount(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	tag := "sus" + suffix

	err := s.InTx(ctx, func(tx *store.Store) error {
		shops := seedShops(t, ctx, tx, suffix, []struct {
			name              string
			published, drafts int
		}{{tag + " a", 1, 0}, {tag + " b", 1, 0}})
		coffeeOf := make([]string, len(shops))
		for i, id := range shops {
			list, _, err := tx.ListCoffees(ctx, store.CoffeeFilter{ShopID: &id}, store.SortNewest, 1, 0)
			if err != nil || len(list) != 1 {
				t.Fatalf("coffee of shop %d: %v (%d)", i, err, len(list))
			}
			coffeeOf[i] = list[0].ID
		}
		// Two accounts (to be suspended) back shop a; one ordinary account backs b.
		backers := []int{0, 0, 1}
		users := make([]string, len(backers))
		for i, shop := range backers {
			u, err := tx.CreateUser(ctx, fmt.Sprintf("sus-%s-%d@example.test", suffix, i), "x", "s")
			if err != nil {
				return err
			}
			users[i] = u.ID
			if err := tx.FollowShop(ctx, u.ID, shops[shop]); err != nil {
				return err
			}
			if err := tx.SaveCoffee(ctx, u.ID, coffeeOf[shop]); err != nil {
				return err
			}
		}
		suspend := func(on bool) {
			for _, id := range users[:2] {
				if _, err := tx.RawDB().Exec(ctx, `UPDATE users SET suspended_at = CASE WHEN $2 THEN now() END WHERE id = $1`, id, on); err != nil {
					t.Fatal(err)
				}
			}
		}
		check := func(name string, wantA int, wantFirst int) {
			t.Helper()
			follows, err := tx.FollowerCountsByShopIDs(ctx, shops)
			if err != nil {
				t.Fatal(err)
			}
			saves, err := tx.SaveCountsByCoffeeIDs(ctx, coffeeOf)
			if err != nil {
				t.Fatal(err)
			}
			if follows[shops[0]] != wantA || saves[coffeeOf[0]] != wantA || follows[shops[1]] != 1 || saves[coffeeOf[1]] != 1 {
				t.Fatalf("%s: follows %v saves %v, want a=%d b=1", name, follows, saves, wantA)
			}
			sh, _, err := tx.ListShops(ctx, store.ShopFilter{SearchTerms: []string{tag}}, store.ShopSortMostFollowed, 10, 0)
			if err != nil || len(sh) != 2 || sh[0].ID != shops[wantFirst] {
				t.Fatalf("%s: most followed = %v (%v), want shop %d first", name, sh, err, wantFirst)
			}
			co, _, err := tx.ListCoffees(ctx, store.CoffeeFilter{SearchTerms: []string{tag}}, store.SortMostSaved, 10, 0)
			if err != nil || len(co) != 2 || co[0].ID != coffeeOf[wantFirst] {
				t.Fatalf("%s: most saved = %v (%v), want shop %d's coffee first", name, co, err, wantFirst)
			}
		}
		check("all active", 2, 0)
		suspend(true)
		check("backers of a suspended", 0, 1)
		suspend(false)
		check("suspension lifted", 2, 0)
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
