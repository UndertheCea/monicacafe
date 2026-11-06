package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// seedShops creates one shop per entry with `published` published coffees and
// `drafts` drafts, created oldest → newest in slice order. Returns the shop IDs.
func seedShops(t *testing.T, ctx context.Context, tx *store.Store, suffix string, shops []struct {
	name              string
	published, drafts int
}) []string {
	t.Helper()
	origins, err := tx.OriginCountries(ctx)
	if err != nil {
		t.Fatal(err)
	}
	methods, err := tx.ProcessingMethods(ctx)
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, len(shops))
	for i, sp := range shops {
		u, err := tx.CreateUser(ctx, fmt.Sprintf("cnt-%s-%d@example.test", suffix, i), "x", "c")
		if err != nil {
			t.Fatal(err)
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: fmt.Sprintf("cnt-%s-%d", suffix, i), Name: sp.name, City: "台南市"})
		if err != nil {
			t.Fatal(err)
		}
		ids[i] = sh.ID
		for j := range sp.published + sp.drafts {
			co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: "c", Slug: fmt.Sprintf("c-%s-%d-%d", suffix, i, j), OriginCountryID: origins[0].ID,
				ProcessingMethodID: methods[0].ID, RoastLevel: "LIGHT",
			})
			if err != nil {
				t.Fatal(err)
			}
			if j < sp.published {
				if _, err := tx.SetCoffeePublished(ctx, co.ID, true); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	return ids
}

func TestPublishedCoffeeCountsByShopIDs(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	err := s.InTx(ctx, func(tx *store.Store) error {
		ids := seedShops(t, ctx, tx, suffix, []struct {
			name              string
			published, drafts int
		}{{"three", 3, 1}, {"drafts only", 0, 2}, {"empty", 0, 0}, {"one", 1, 0}})

		got, err := tx.PublishedCoffeeCountsByShopIDs(ctx, ids)
		if err != nil {
			return err
		}
		for i, want := range []int{3, 0, 0, 1} {
			if got[ids[i]] != want {
				t.Errorf("shop %d: got %d published coffees, want %d", i, got[ids[i]], want)
			}
		}
		if _, ok := got[ids[2]]; ok {
			t.Errorf("shop with no coffees should be absent from the map")
		}
		empty, err := tx.PublishedCoffeeCountsByShopIDs(ctx, nil)
		if err != nil || len(empty) != 0 {
			t.Errorf("no ids: got %v, %v", empty, err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
