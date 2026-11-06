package store

import (
	"strings"
	"testing"
)

func TestCoffeeSortOrderBy(t *testing.T) {
	cases := []struct {
		sort      CoffeeSort
		joinHas   string
		orderWant string
	}{
		{SortNewest, "", "c.created_at DESC, c.id"},
		{CoffeeSort("bogus"), "", "c.created_at DESC, c.id"},
		{SortPriceAsc, "min(v.price_twd)", "fp.p ASC NULLS LAST, c.created_at DESC, c.id"},
		{SortPriceDesc, "min(v.price_twd)", "fp.p DESC NULLS LAST, c.created_at DESC, c.id"},
		{SortMostDiscussed, "count(*)", "cc.n DESC, c.created_at DESC, c.id"},
	}
	for _, tc := range cases {
		t.Run(string(tc.sort), func(t *testing.T) {
			join, order := tc.sort.orderBy()
			if order != tc.orderWant {
				t.Errorf("order = %q, want %q", order, tc.orderWant)
			}
			if tc.joinHas == "" && join != "" {
				t.Errorf("join = %q, want none", join)
			}
			if !strings.Contains(join, tc.joinHas) {
				t.Errorf("join %q lacks %q", join, tc.joinHas)
			}
			if strings.Contains(order, "fp.") && !strings.Contains(join, "v.is_available AND v.stock > 0") {
				t.Errorf("price sort must only count available, in-stock variants: %q", join)
			}
		})
	}
}
