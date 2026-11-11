package store_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
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

// publishCoffee gives a shop one published coffee, so public listings show it.
func publishCoffee(t *testing.T, ctx context.Context, tx *store.Store, shopID, slug string) {
	t.Helper()
	origins, err := tx.OriginCountries(ctx)
	if err != nil {
		t.Fatal(err)
	}
	methods, err := tx.ProcessingMethods(ctx)
	if err != nil {
		t.Fatal(err)
	}
	co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
		ShopID: shopID, Name: "c", Slug: slug, OriginCountryID: origins[0].ID,
		ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.SetCoffeePublished(ctx, co.ID, true); err != nil {
		t.Fatal(err)
	}
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

func TestListShopsSort(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	city := "測試市-" + suffix // isolates these shops from seed data

	err := s.InTx(ctx, func(tx *store.Store) error {
		ids := seedShops(t, ctx, tx, suffix, []struct {
			name              string
			published, drafts int
		}{{"Bravo", 1, 3}, {"Alpha", 0, 0}, {"Delta", 2, 0}, {"Charlie", 1, 0}})
		names := map[string]string{}
		for i, n := range []string{"Bravo", "Alpha", "Delta", "Charlie"} {
			names[ids[i]] = n
			c := city
			if _, err := tx.UpdateShop(ctx, ids[i], store.UpdateShopParams{City: &c}); err != nil {
				return err
			}
		}
		// Shops created in one transaction share now(); spread created_at so
		// "newest" is well defined.
		for i, id := range ids {
			var got string
			if err := tx.QueryRowForTest(ctx, `UPDATE shops SET created_at = now() - make_interval(mins => $2)
				WHERE id = $1 RETURNING id`, id, 10-i).Scan(&got); err != nil {
				return err
			}
		}

		// Followers: Alpha 2, Bravo 1, Charlie 1, Delta 0.
		for i, shop := range []int{1, 1, 0, 3} { // ids order: Bravo, Alpha, Delta, Charlie
			u, err := tx.CreateUser(ctx, fmt.Sprintf("sortfol-%s-%d@example.test", suffix, i), "x", "f")
			if err != nil {
				return err
			}
			if err := tx.FollowShop(ctx, u.ID, ids[shop]); err != nil {
				return err
			}
		}

		for _, tc := range []struct {
			sort          store.ShopSort
			limit, offset int
			want          string
		}{
			// Alpha has no published coffee, so no listing shows it (#213),
			// even though it has the most followers.
			{store.ShopSortNewest, 10, 0, "Charlie,Delta,Bravo"},
			{store.ShopSortName, 10, 0, "Bravo,Charlie,Delta"},
			// Bravo's drafts don't count; Bravo and Charlie tie at 1 → newer first.
			{store.ShopSortMostCoffees, 10, 0, "Delta,Charlie,Bravo"},
			{store.ShopSortMostCoffees, 2, 1, "Charlie,Bravo"},
			// Bravo and Charlie tie at 1 → newer first; nobody follows Delta.
			{store.ShopSortMostFollowed, 10, 0, "Charlie,Bravo,Delta"},
			{store.ShopSortMostFollowed, 1, 2, "Delta"},
		} {
			got, total, err := tx.ListShops(ctx, store.ShopFilter{City: &city}, tc.sort, tc.limit, tc.offset)
			if err != nil {
				return err
			}
			var out []string
			for _, sh := range got {
				out = append(out, names[sh.ID])
			}
			if s := strings.Join(out, ","); s != tc.want || total != 3 {
				t.Errorf("%q limit %d offset %d: got %s (total %d), want %s (total 3)", tc.sort, tc.limit, tc.offset, s, total, tc.want)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
