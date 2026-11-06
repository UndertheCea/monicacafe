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

func TestCoffeeFilterWhere(t *testing.T) {
	id, lo := "x", int64(100)
	const stock = "EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0)"
	cases := []struct {
		name     string
		f        CoffeeFilter
		want     string
		wantArgs int
	}{
		{"published only by default", CoffeeFilter{}, " WHERE c.is_published", 0},
		{"drafts included, nothing else", CoffeeFilter{IncludeUnpublished: true}, "", 0},
		{"in stock", CoffeeFilter{InStock: true}, " WHERE c.is_published AND " + stock, 0},
		{"shop + in stock", CoffeeFilter{ShopID: &id, InStock: true, IncludeUnpublished: true}, " WHERE c.shop_id = $1 AND " + stock, 1},
		{"min price keeps its own in-stock check", CoffeeFilter{MinPriceTWD: &lo, IncludeUnpublished: true},
			" WHERE EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0 AND v.price_twd >= $1)", 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := tc.f.where()
			if got != tc.want || len(args) != tc.wantArgs {
				t.Errorf("where() = %q (%d args), want %q (%d args)", got, len(args), tc.want, tc.wantArgs)
			}
		})
	}
}

func TestLikePattern(t *testing.T) {
	cases := []struct{ in, want string }{
		{"geisha", "%geisha%"},
		{"耶加雪菲", "%耶加雪菲%"},
		{"100%", `%100\%%`},
		{"a_b", `%a\_b%`},
		{`c:\x`, `%c:\\x%`},
		{`\%`, `%\\\%%`},
	}
	for _, tc := range cases {
		if got := LikePattern(tc.in); got != tc.want {
			t.Errorf("LikePattern(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
