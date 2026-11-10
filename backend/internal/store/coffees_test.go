package store_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestListCoffeesSort checks every sort order on one shop's coffees, inside a
// rolled-back transaction. Price sorts use the cheapest available, in-stock
// variant; sold-out coffees go last either way.
func TestListCoffeesSort(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	err := s.InTx(ctx, func(tx *store.Store) error {
		origins, err := tx.OriginCountries(ctx)
		if err != nil {
			return err
		}
		methods, err := tx.ProcessingMethods(ctx)
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "sort-"+suffix+"@example.test", "x", "s")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "sort-" + suffix, Name: "s", City: "台北市"})
		if err != nil {
			return err
		}
		type v struct {
			price int64
			stock int
			off   bool
		}
		// Savers: saves come from distinct users (one save per user + coffee).
		var savers []string
		for i := range 2 {
			su, err := tx.CreateUser(ctx, fmt.Sprintf("sort-saver%d-%s@example.test", i, suffix), "x", "s")
			if err != nil {
				return err
			}
			savers = append(savers, su.ID)
		}
		ids := map[string]string{}
		for _, c := range []struct {
			name     string
			variants []v
			comments int
			saves    int
		}{
			{"a", []v{{500, 3, false}}, 1, 0},
			{"b", []v{{300, 1, false}, {100, 0, false}}, 0, 2}, // the NT$100 one is sold out
			{"c", []v{{50, 0, false}}, 2, 0},                   // sold out
			{"d", []v{{200, 5, true}, {700, 2, false}}, 0, 1},  // the NT$200 one is unavailable
		} {
			co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: c.name, Slug: c.name + "-" + suffix, OriginCountryID: origins[0].ID,
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
			})
			if err != nil {
				return err
			}
			ids[co.ID] = c.name
			for i, vv := range c.variants {
				va, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "WHOLE_BEAN", WeightG: 100 * (i + 1), PriceTWD: vv.price, Stock: vv.stock})
				if err != nil {
					return err
				}
				if vv.off {
					off := false
					if _, err := tx.UpdateVariant(ctx, va.ID, store.UpdateVariantParams{IsAvailable: &off}); err != nil {
						return err
					}
				}
			}
			for range c.comments {
				if _, err := tx.CreateComment(ctx, u.ID, co.ID, "hi"); err != nil {
					return err
				}
			}
			for _, uid := range savers[:c.saves] {
				if err := tx.SaveCoffee(ctx, uid, co.ID); err != nil {
					return err
				}
			}
		}

		f := store.CoffeeFilter{ShopID: &sh.ID, IncludeUnpublished: true}
		for _, tc := range []struct {
			sort  store.CoffeeSort
			check func([]string) bool
			want  string
		}{
			{store.SortPriceAsc, func(g []string) bool { return slices.Equal(g, []string{"b", "a", "d", "c"}) }, "b a d c"},
			{store.SortPriceDesc, func(g []string) bool { return slices.Equal(g, []string{"d", "a", "b", "c"}) }, "d a b c"},
			{store.SortMostDiscussed, func(g []string) bool { return len(g) == 4 && g[0] == "c" && g[1] == "a" }, "c a …"},
			{store.SortMostSaved, func(g []string) bool { return len(g) == 4 && g[0] == "b" && g[1] == "d" }, "b d …"},
			{store.SortNewest, func(g []string) bool { return len(g) == 4 }, "all four"},
		} {
			cs, total, err := tx.ListCoffees(ctx, f, tc.sort, 10, 0)
			if err != nil {
				return fmt.Errorf("%q: %w", tc.sort, err)
			}
			var got []string
			for _, c := range cs {
				got = append(got, ids[c.ID])
			}
			if total != 4 || !tc.check(got) {
				return fmt.Errorf("sort %q: got %v (total %d), want %s", tc.sort, got, total, tc.want)
			}
			// Paging stays consistent with the full order.
			p2, _, err := tx.ListCoffees(ctx, f, tc.sort, 2, 2)
			if err != nil || len(p2) != 2 || p2[0].ID != cs[2].ID || p2[1].ID != cs[3].ID {
				return fmt.Errorf("sort %q: page 2 disagrees with the full list (%v)", tc.sort, err)
			}
		}
		// InStock drops c (its only variant has no stock); d's available variant keeps it.
		inStock := f
		inStock.InStock = true
		cs, total, err := tx.ListCoffees(ctx, inStock, store.SortPriceAsc, 10, 0)
		if err != nil {
			return err
		}
		var got []string
		for _, c := range cs {
			got = append(got, ids[c.ID])
		}
		if total != 3 || !slices.Equal(got, []string{"b", "a", "d"}) {
			return fmt.Errorf("in stock: got %v (total %d), want b a d", got, total)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
