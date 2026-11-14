package store

import (
	"fmt"
	"reflect"
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
		{SortMostSaved, "saved_coffees", "sc.n DESC, c.created_at DESC, c.id"},
		{SortShopOrder, "", "c.shop_position, c.created_at DESC, c.id"},
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
	id, lo, year, alt := "x", int64(100), 2025, 1500
	const stock = "EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0)"
	cases := []struct {
		name     string
		f        CoffeeFilter
		want     string
		wantArgs int
	}{
		{"published only by default", CoffeeFilter{}, " WHERE " + publicCoffee + "", 0},
		{"drafts included, nothing else", CoffeeFilter{IncludeUnpublished: true}, " WHERE c.archived_at IS NULL", 0},
		{"in stock", CoffeeFilter{InStock: true}, " WHERE " + publicCoffee + " AND " + stock, 0},
		{"sold out", CoffeeFilter{SoldOut: true}, " WHERE " + publicCoffee + " AND NOT " + stock, 0},
		{"shop + sold out, drafts", CoffeeFilter{ShopID: &id, SoldOut: true, IncludeUnpublished: true}, " WHERE c.archived_at IS NULL AND c.shop_id = $1 AND NOT " + stock, 1},
		{"brew methods", CoffeeFilter{BrewMethods: []string{"FILTER", "OMNI"}}, " WHERE " + publicCoffee + " AND c.brew_method = ANY($1)", 1},
		{"harvest year", CoffeeFilter{MinHarvestYear: &year}, " WHERE " + publicCoffee + " AND c.harvest_year >= $1", 1},
		{"min altitude", CoffeeFilter{MinAltitudeM: &alt}, " WHERE " + publicCoffee + " AND COALESCE(c.altitude_max_m, c.altitude_min_m) >= $1", 1},
		{"search term covers flavour notes", CoffeeFilter{SearchTerms: []string{"茉莉花"}}, " WHERE " + publicCoffee + " AND " + fmt.Sprintf(searchCond, 1), 1},
		{"shop + in stock", CoffeeFilter{ShopID: &id, InStock: true, IncludeUnpublished: true}, " WHERE c.archived_at IS NULL AND c.shop_id = $1 AND " + stock, 1},
		{"min price keeps its own in-stock check", CoffeeFilter{MinPriceTWD: &lo, IncludeUnpublished: true},
			" WHERE c.archived_at IS NULL AND EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0 AND v.price_twd >= $1)", 1},
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

// TestSearchPatterns: a search word becomes the escaped patterns for itself
// and its synonyms (#269), all passed as one array argument.
func TestSearchPatterns(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"50%", []string{`%50\%%`}},
		{"Yirgacheffe", []string{"%Yirgacheffe%", "%Yirgachefe%", "%耶加雪菲%", "%耶加雪啡%"}},
		{"瑰夏", []string{"%瑰夏%", "%Geisha%", "%Gesha%", "%藝伎%", "%藝妓%"}},
	}
	for _, tc := range cases {
		if got := searchPatterns(tc.in); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("searchPatterns(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	_, args := CoffeeFilter{SearchTerms: []string{"耶加雪菲", "Natural"}}.where()
	if len(args) != 2 {
		t.Fatalf("two words → %d args, want 2", len(args))
	}
	if _, ok := args[0].([]string); !ok {
		t.Errorf("search arg is %T, want []string (ILIKE ANY)", args[0])
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
