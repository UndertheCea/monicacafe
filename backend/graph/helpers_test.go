package graph

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Ethiopia Yirgacheffe Kochere": "ethiopia-yirgacheffe-kochere",
		"衣索比亞 耶加雪菲":                    "coffee",
		"衣索比亞 Guji G1 (Natural)":       "guji-g1-natural",
		"  --Hello__World--  ":         "hello-world",
		strings.Repeat("ab ", 40):      strings.TrimSuffix(strings.Repeat("ab-", 20), "-"),
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
		if !slugRe.MatchString(slugify(in)) {
			t.Errorf("slugify(%q) produced invalid slug", in)
		}
	}
}

func TestRandomSuffix(t *testing.T) {
	s, err := randomSuffix(6)
	if err != nil || len(s) != 6 || !slugRe.MatchString(s) {
		t.Fatalf("bad suffix %q (%v)", s, err)
	}
}

func TestPage(t *testing.T) {
	ip := func(v int) *int { return &v }
	tests := []struct {
		limit, offset *int
		l, o          int
	}{
		{nil, nil, defaultPageSize, 0},
		{ip(0), ip(-5), 1, 0},
		{ip(1000), ip(40), maxPageSize, 40},
		{ip(2), ip(4), 2, 4},
	}
	for _, tc := range tests {
		l, o := page(tc.limit, tc.offset)
		if l != tc.l || o != tc.o {
			t.Errorf("page(%v,%v) = %d,%d want %d,%d", tc.limit, tc.offset, l, o, tc.l, tc.o)
		}
	}
}

func TestSimilarLimit(t *testing.T) {
	ip := func(v int) *int { return &v }
	tests := []struct {
		limit *int
		want  int
	}{
		{nil, 4},
		{ip(0), 1},
		{ip(-3), 1},
		{ip(7), 7},
		{ip(12), 12},
		{ip(50), 12},
	}
	for _, tc := range tests {
		if got := similarLimit(tc.limit); got != tc.want {
			t.Errorf("similarLimit(%v) = %d, want %d", tc.limit, got, tc.want)
		}
	}
}

func TestShopSlug(t *testing.T) {
	if s, err := normaliseShopSlug(" Mountain-Roasters "); err != nil || s != "mountain-roasters" {
		t.Fatalf("got %q %v", s, err)
	}
	for _, bad := range []string{"ab", "has space", "double--dash", "-lead", "咖啡店"} {
		if _, err := normaliseShopSlug(bad); err == nil {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}

func TestEmail(t *testing.T) {
	if e, err := normaliseEmail("  Foo@Example.COM "); err != nil || e != "foo@example.com" {
		t.Fatalf("got %q %v", e, err)
	}
	for _, bad := range []string{"", "nope", "Name <a@b.com>", "a@"} {
		if _, err := normaliseEmail(bad); err == nil {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}

func TestCleanFlavorNotes(t *testing.T) {
	got, err := cleanFlavorNotes([]string{" Jasmine ", "jasmine", "", "柑橘"})
	if err != nil || len(got) != 2 || got[0] != "Jasmine" || got[1] != "柑橘" {
		t.Fatalf("got %v %v", got, err)
	}
	if got, _ := cleanFlavorNotes(nil); got != nil {
		t.Fatal("nil must stay nil (means unchanged)")
	}
	many := make([]string, maxFlavorNotes+1)
	for i := range many {
		many[i] = strings.Repeat("x", i+1)
	}
	if _, err := cleanFlavorNotes(many); err == nil {
		t.Fatal("too many notes accepted")
	}
	if _, err := cleanFlavorNotes([]string{strings.Repeat("香", maxFlavorNoteLen+1)}); err == nil {
		t.Fatal("over-long note accepted")
	}
}

func TestRequireFlavorNotes(t *testing.T) {
	for _, tc := range []struct {
		name  string
		in    []string
		given bool
		want  int  // notes kept
		bad   bool // BAD_USER_INPUT on flavorNotes
	}{
		{"update leaves notes alone", nil, false, 0, false},
		{"one note", []string{"Jasmine"}, true, 1, false},
		{"trimmed and de-duplicated", []string{" 柑橘 ", "柑橘", "Peach"}, true, 2, false},
		{"missing on create", nil, true, 0, true},
		{"empty list", []string{}, true, 0, true},
		{"blank after trimming", []string{"  ", ""}, true, 0, true},
		{"too long still rejected", []string{strings.Repeat("x", maxFlavorNoteLen+1)}, true, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := requireFlavorNotes(tc.in, tc.given)
			if tc.bad {
				var ae *apiError
				if !errors.As(err, &ae) || ae.code != CodeBadInput || ae.field != "flavorNotes" {
					t.Fatalf("want BAD_USER_INPUT on flavorNotes, got %v", err)
				}
				return
			}
			if err != nil || len(got) != tc.want {
				t.Fatalf("got %v %v, want %d notes", got, err, tc.want)
			}
		})
	}
}

func TestValidateVariants(t *testing.T) {
	ok := []*model.VariantInput{
		{Grind: model.GrindOptionWholeBean, WeightG: 200, PriceTwd: 450, Stock: 3},
		{Grind: model.GrindOptionEspresso, WeightG: 200, PriceTwd: 450, Stock: 0},
	}
	if out, err := validateVariants(ok); err != nil || len(out) != 2 {
		t.Fatalf("valid variants rejected: %v", err)
	}
	bad := [][]*model.VariantInput{
		nil,
		{{Grind: model.GrindOptionWholeBean, WeightG: 0, PriceTwd: 1, Stock: 1}},
		{{Grind: model.GrindOptionWholeBean, WeightG: 100, PriceTwd: -1, Stock: 1}},
		{{Grind: model.GrindOptionWholeBean, WeightG: 100, PriceTwd: 1, Stock: -1}},
		{{Grind: "BOGUS", WeightG: 100, PriceTwd: 1, Stock: 1}},
		{ok[0], ok[0]},
	}
	for i, vs := range bad {
		if _, err := validateVariants(vs); err == nil {
			t.Errorf("case %d: invalid variants accepted", i)
		}
	}
}

func TestStoreFilter(t *testing.T) {
	bad := "not-a-uuid"
	if _, err := storeFilter(&model.CoffeeFilter{OriginCountryID: &bad}); err == nil {
		t.Fatal("malformed ID accepted")
	}
	blank := "   "
	f, err := storeFilter(&model.CoffeeFilter{FlavorNote: &blank})
	if err != nil || f.FlavorNote != nil || f.IncludeUnpublished {
		t.Fatalf("unexpected filter %+v %v", f, err)
	}
	for _, tc := range []struct {
		name             string
		in               *bool
		inStock, soldOut bool
	}{
		{"null: everything", nil, false, false},
		{"false: only sold out", boolPtr(false), false, true},
		{"true: only in stock", boolPtr(true), true, false},
	} {
		f, err := storeFilter(&model.CoffeeFilter{InStock: tc.in})
		if err != nil || f.InStock != tc.inStock || f.SoldOut != tc.soldOut {
			t.Errorf("inStock %s: got InStock=%v SoldOut=%v, %v", tc.name, f.InStock, f.SoldOut, err)
		}
	}
	for _, tc := range []struct {
		year int
		ok   bool
	}{{1999, false}, {2000, true}, {2025, true}, {2100, true}, {2101, false}, {25, false}} {
		y := tc.year
		f, err := storeFilter(&model.CoffeeFilter{MinHarvestYear: &y})
		if !tc.ok {
			if ae, ok := err.(*apiError); !ok || ae.field != "minHarvestYear" {
				t.Errorf("minHarvestYear %d: got %v, want a bad-input error", y, err)
			}
			continue
		}
		if err != nil || f.MinHarvestYear == nil || *f.MinHarvestYear != y {
			t.Errorf("minHarvestYear %d: got %+v, %v", y, f.MinHarvestYear, err)
		}
	}
	ip := func(v int) *int { return &v }
	for _, tc := range []struct {
		name      string
		in        model.CoffeeFilter
		wantField string // "" = valid
	}{
		{"altitude 0", model.CoffeeFilter{MinAltitudeM: ip(0)}, ""},
		{"altitude 1500", model.CoffeeFilter{MinAltitudeM: ip(1500)}, ""},
		{"altitude 6000", model.CoffeeFilter{MinAltitudeM: ip(6000)}, ""},
		{"altitude -1", model.CoffeeFilter{MinAltitudeM: ip(-1)}, "minAltitudeM"},
		{"altitude 6001", model.CoffeeFilter{MinAltitudeM: ip(6001)}, "minAltitudeM"},
	} {
		f, err := storeFilter(&tc.in)
		if tc.wantField != "" {
			if ae, ok := err.(*apiError); !ok || ae.field != tc.wantField {
				t.Errorf("%s: got %v, want a bad-input error on %s", tc.name, err, tc.wantField)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", tc.name, err)
			continue
		}
		same := func(a, b *int) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
		if !same(f.MinAltitudeM, tc.in.MinAltitudeM) {
			t.Errorf("%s: got altitude %v", tc.name, f.MinAltitudeM)
		}
	}
}

func TestSearchTerms(t *testing.T) {
	cases := []struct {
		in      string
		want    []string
		wantErr bool
	}{
		{"", nil, false},
		{"   ", nil, false},
		{"geisha", []string{"geisha"}, false},
		{"  耶加雪菲   Geisha\t淺焙 ", []string{"耶加雪菲", "Geisha", "淺焙"}, false},
		{"Geisha geisha GEISHA", []string{"Geisha"}, false},
		{"100% a_b", []string{"100%", "a_b"}, false},
		{"a b c d e f g h", []string{"a", "b", "c", "d", "e", "f", "g", "h"}, false},
		{"a b c d e f g h i", nil, true},
		{strings.Repeat("咖", 100), []string{strings.Repeat("咖", 100)}, false},
		{strings.Repeat("咖", 101), nil, true},
	}
	for _, tc := range cases {
		got, err := searchTerms(tc.in)
		if (err != nil) != tc.wantErr {
			t.Errorf("searchTerms(%q) error %v, wantErr %v", tc.in, err, tc.wantErr)
			continue
		}
		if !tc.wantErr && !reflect.DeepEqual(got, tc.want) {
			t.Errorf("searchTerms(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	f, err := storeFilter(&model.CoffeeFilter{Search: strPtr(" a  b ")})
	if err != nil || !reflect.DeepEqual(f.SearchTerms, []string{"a", "b"}) {
		t.Errorf("storeFilter search: %+v %v", f.SearchTerms, err)
	}
}

func TestStoreSort(t *testing.T) {
	s := func(v model.CoffeeSort) *model.CoffeeSort { return &v }
	tests := []struct {
		in      *model.CoffeeSort
		want    store.CoffeeSort
		wantErr bool
	}{
		{nil, store.SortNewest, false},
		{s(model.CoffeeSortNewest), store.SortNewest, false},
		{s(model.CoffeeSortPriceAsc), store.SortPriceAsc, false},
		{s(model.CoffeeSortPriceDesc), store.SortPriceDesc, false},
		{s(model.CoffeeSortMostDiscussed), store.SortMostDiscussed, false},
		{s(model.CoffeeSortMostSaved), store.SortMostSaved, false},
		{s(model.CoffeeSortShopOrder), store.SortShopOrder, false},
		{s("CHEAPEST"), store.SortNewest, true},
	}
	for _, tc := range tests {
		got, err := storeSort(tc.in)
		if got != tc.want || (err != nil) != tc.wantErr {
			t.Errorf("storeSort(%v) = %q, %v; want %q, err=%v", tc.in, got, err, tc.want, tc.wantErr)
		}
	}
}

func TestCheckLineup(t *testing.T) {
	have := []string{"a", "b", "c"}
	tests := []struct {
		name string
		want []string
		ok   bool
	}{
		{"same order", []string{"a", "b", "c"}, true},
		{"reordered", []string{"c", "a", "b"}, true},
		{"missing one", []string{"a", "b"}, false},
		{"extra one", []string{"a", "b", "c", "d"}, false},
		{"foreign id", []string{"a", "b", "x"}, false},
		{"duplicate", []string{"a", "a", "b"}, false},
		{"empty", []string{}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkLineup(have, tc.want)
			if (err == nil) != tc.ok {
				t.Fatalf("checkLineup(%v) = %v, want ok=%v", tc.want, err, tc.ok)
			}
			var ae *apiError
			if err != nil && (!errors.As(err, &ae) || ae.code != CodeBadInput || ae.field != "coffeeIds") {
				t.Errorf("err = %#v, want BAD_USER_INPUT on coffeeIds", err)
			}
		})
	}
	if err := checkLineup(nil, []string{}); err != nil {
		t.Errorf("empty shop, empty list: %v", err)
	}
}

func TestStoreShopSort(t *testing.T) {
	s := func(v model.ShopSort) *model.ShopSort { return &v }
	tests := []struct {
		in      *model.ShopSort
		want    store.ShopSort
		wantErr bool
	}{
		{nil, store.ShopSortNewest, false},
		{s(model.ShopSortNewest), store.ShopSortNewest, false},
		{s(model.ShopSortName), store.ShopSortName, false},
		{s(model.ShopSortMostCoffees), store.ShopSortMostCoffees, false},
		{s(model.ShopSortMostFollowed), store.ShopSortMostFollowed, false},
		{s("BIGGEST"), store.ShopSortNewest, true},
	}
	for _, tc := range tests {
		got, err := storeShopSort(tc.in)
		if got != tc.want || (err != nil) != tc.wantErr {
			t.Errorf("storeShopSort(%v) = %q, %v; want %q, err=%v", tc.in, got, err, tc.want, tc.wantErr)
		}
	}
}

func TestToShopPin(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name     string
		lat, lng *float64
		wantPin  bool
	}{
		{"taipei", f(25.033), f(121.565), true},
		{"origin is valid", f(0), f(0), true},
		{"no coords", nil, nil, false},
		{"lat only", f(25.0), nil, false},
		{"lng only", nil, f(121.5), false},
		{"lat out of range", f(95), f(121.5), false},
		{"lng out of range", f(25), f(-181), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := toShopPin(&store.ShopPin{ID: "id", Slug: "s", Name: "n", City: "台北市", Lat: tc.lat, Lng: tc.lng})
			if got.ID != "id" || got.Slug != "s" || got.Name != "n" || got.City != "台北市" {
				t.Fatalf("identity fields not copied: %+v", got)
			}
			hasPin := got.Lat != nil && got.Lng != nil
			if hasPin != tc.wantPin {
				t.Fatalf("pin = %v, want %v", hasPin, tc.wantPin)
			}
			if !hasPin && (got.Lat != nil || got.Lng != nil) {
				t.Fatalf("half a coordinate leaked: %+v", got)
			}
		})
	}
}

func TestValidateVariantUpdate(t *testing.T) {
	ip := func(v int) *int { return &v }
	bp := func(v bool) *bool { return &v }
	cases := []struct {
		name      string
		in        model.UpdateVariantInput
		wantErr   bool
		wantPrice *int64
		wantStock *int
		wantAvail *bool
	}{
		{name: "empty", in: model.UpdateVariantInput{}, wantErr: true},
		{name: "price only", in: model.UpdateVariantInput{PriceTwd: ip(520)}, wantPrice: ptr64(520)},
		{name: "free coffee allowed", in: model.UpdateVariantInput{PriceTwd: ip(0)}, wantPrice: ptr64(0)},
		{name: "negative price", in: model.UpdateVariantInput{PriceTwd: ip(-1)}, wantErr: true},
		{name: "price too high", in: model.UpdateVariantInput{PriceTwd: ip(maxPriceTWD + 1)}, wantErr: true},
		{name: "stock zero", in: model.UpdateVariantInput{Stock: ip(0)}, wantStock: ip(0)},
		{name: "negative stock", in: model.UpdateVariantInput{Stock: ip(-3)}, wantErr: true},
		{name: "stock too high", in: model.UpdateVariantInput{Stock: ip(maxStock + 1)}, wantErr: true},
		{name: "availability only", in: model.UpdateVariantInput{IsAvailable: bp(false)}, wantAvail: bp(false)},
		{
			name:      "all fields",
			in:        model.UpdateVariantInput{PriceTwd: ip(380), Stock: ip(12), IsAvailable: bp(true)},
			wantPrice: ptr64(380), wantStock: ip(12), wantAvail: bp(true),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := validateVariantUpdate(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if tc.wantErr {
				return
			}
			if !eqp(got.PriceTWD, tc.wantPrice) || !eqp(got.Stock, tc.wantStock) || !eqp(got.IsAvailable, tc.wantAvail) {
				t.Errorf("got %+v", got)
			}
		})
	}
}

func TestValidateVariant(t *testing.T) {
	cases := []struct {
		name    string
		in      *model.VariantInput
		wantErr bool
	}{
		{"nil", nil, true},
		{"ok", &model.VariantInput{Grind: model.GrindOptionFine, WeightG: 250, PriceTwd: 600, Stock: 5}, false},
		{"max weight", &model.VariantInput{Grind: model.GrindOptionFine, WeightG: maxWeightG, PriceTwd: 1, Stock: 0}, false},
		{"weight over max", &model.VariantInput{Grind: model.GrindOptionFine, WeightG: maxWeightG + 1, PriceTwd: 1, Stock: 0}, true},
		{"bad grind", &model.VariantInput{Grind: "POWDER", WeightG: 100, PriceTwd: 1, Stock: 0}, true},
		{"bad price", &model.VariantInput{Grind: model.GrindOptionFine, WeightG: 100, PriceTwd: -5, Stock: 0}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := validateVariant(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if !tc.wantErr && (p.Grind != string(tc.in.Grind) || p.PriceTWD != int64(tc.in.PriceTwd)) {
				t.Errorf("params not copied: %+v", p)
			}
		})
	}
}

func ptr64(v int64) *int64 { return &v }

func eqp[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func TestValidatePasswordChange(t *testing.T) {
	cases := []struct {
		name, current, next, wantField string
	}{
		{"ok", "old-password-1", "new-password-2", ""},
		{"missing current", "", "new-password-2", "currentPassword"},
		{"too short", "old-password-1", "short", "newPassword"},
		{"too long", "old-password-1", strings.Repeat("x", 73), "newPassword"},
		{"unchanged", "same-password", "same-password", "newPassword"},
	}
	for _, c := range cases {
		err := validatePasswordChange(c.current, c.next)
		var field string
		if ae, ok := err.(*apiError); ok {
			field = ae.field
		} else if err != nil {
			t.Fatalf("%s: unexpected error type %T", c.name, err)
		}
		if field != c.wantField {
			t.Errorf("%s: field = %q, want %q (err %v)", c.name, field, c.wantField, err)
		}
	}
}
func boolPtr(v bool) *bool { return &v }

func TestCopyName(t *testing.T) {
	long := strings.Repeat("咖", 120)
	tests := []struct {
		name, in, suffix, want string
	}{
		{"short", "Kenya AA", " (copy)", "Kenya AA (copy)"},
		{"chinese suffix", "肯亞", "（複本）", "肯亞（複本）"},
		{"trimmed to fit", long, " (copy)", strings.Repeat("咖", 113) + " (copy)"},
		{"trailing space dropped after trim", strings.Repeat("a", 112) + " bcd", " (copy)", strings.Repeat("a", 112) + " (copy)"},
		{"exactly fits", strings.Repeat("b", 113), " (copy)", strings.Repeat("b", 113) + " (copy)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := copyName(tt.in, tt.suffix)
			if got != tt.want {
				t.Fatalf("copyName = %q, want %q", got, tt.want)
			}
			if n := utf8.RuneCountInString(got); n > maxCoffeeName {
				t.Fatalf("%d runes > %d", n, maxCoffeeName)
			}
		})
	}
}
func strPtr(v string) *string { return &v }

func TestValidateAltitude(t *testing.T) {
	n := func(v int) *int { return &v }
	for _, tt := range []struct {
		name     string
		min, max *int
		field    string // "" = valid
	}{
		{"not given", nil, nil, ""},
		{"single height", n(1900), nil, ""},
		{"range", n(1800), n(2100), ""},
		{"equal ends", n(2000), n(2000), ""},
		{"sea level", n(0), nil, ""},
		{"top of the range", n(6000), n(6000), ""},
		{"max without min", nil, n(2000), "altitudeMinM"},
		{"negative min", n(-1), nil, "altitudeMinM"},
		{"min too high", n(6001), nil, "altitudeMinM"},
		{"max too high", n(1000), n(6001), "altitudeMaxM"},
		{"max below min", n(2000), n(1800), "altitudeMaxM"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateAltitude(tt.min, tt.max)
			if tt.field == "" {
				if err != nil {
					t.Fatalf("rejected: %v", err)
				}
				return
			}
			ae, ok := err.(*apiError)
			if !ok || ae.field != tt.field {
				t.Fatalf("got %v, want a bad-input error on %s", err, tt.field)
			}
		})
	}
}

func TestCleanProvenance(t *testing.T) {
	s := func(v string) *string { return &v }
	for _, tt := range []struct {
		name               string
		producer, region   *string
		wantP, wantR, fail string
	}{
		{"nil", nil, nil, "", "", ""},
		{"trimmed", s("  Finca El Injerto "), s(" Huehuetenango\n"), "Finca El Injerto", "Huehuetenango", ""},
		{"blank", s("   "), s(""), "", "", ""},
		{"100 runes", s(strings.Repeat("咖", 100)), nil, strings.Repeat("咖", 100), "", ""},
		{"producer too long", s(strings.Repeat("a", 101)), nil, "", "", "producer"},
		{"region too long", nil, s(strings.Repeat("區", 101)), "", "", "region"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			p, r, err := cleanProvenance(tt.producer, tt.region)
			if tt.fail != "" {
				if ae, ok := err.(*apiError); !ok || ae.field != tt.fail {
					t.Fatalf("got %v, want a bad-input error on %s", err, tt.fail)
				}
				return
			}
			if err != nil || p != tt.wantP || r != tt.wantR {
				t.Fatalf("got (%q, %q, %v), want (%q, %q)", p, r, err, tt.wantP, tt.wantR)
			}
		})
	}
}

func TestRequireCoffeeEssentials(t *testing.T) {
	v, alt, blank := "variety-id", 1500, " "
	for _, tt := range []struct {
		name             string
		variety          *string
		producer, region string
		altitude         *int
		field            string // "" = ok
	}{
		{"all given", &v, "Kochere", "Gedeo", &alt, ""},
		{"no variety", nil, "Kochere", "Gedeo", &alt, "varietyId"},
		{"blank variety", &blank, "Kochere", "Gedeo", &alt, "varietyId"},
		{"no producer", &v, "", "Gedeo", &alt, "producer"},
		{"no region", &v, "Kochere", "", &alt, "region"},
		{"no altitude", &v, "Kochere", "Gedeo", nil, "altitudeMinM"},
		{"nothing: variety first", nil, "", "", nil, "varietyId"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := requireCoffeeEssentials(tt.variety, tt.producer, tt.region, tt.altitude)
			if tt.field == "" {
				if err != nil {
					t.Fatalf("got %v, want ok", err)
				}
				return
			}
			if ae, ok := err.(*apiError); !ok || ae.field != tt.field {
				t.Fatalf("got %v, want a bad-input error on %s", err, tt.field)
			}
		})
	}
}

func TestRoastLevelParam(t *testing.T) {
	r := func(v string) *model.RoastLevel { x := model.RoastLevel(v); return &x }
	for _, tt := range []struct {
		name string
		in   *model.RoastLevel
		want string // "nil" = not given
		fail bool
	}{
		{"not given", nil, "nil", false},
		{"extra light", r("EXTRA_LIGHT"), "EXTRA_LIGHT", false},
		{"light", r("LIGHT"), "LIGHT", false},
		{"dark", r("DARK"), "DARK", false},
		{"lower case", r("light"), "", true},
		{"unknown", r("BLONDE"), "", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := roastLevelParam(tt.in)
			if tt.fail {
				if ae, ok := err.(*apiError); !ok || ae.field != "roastLevel" {
					t.Fatalf("got %v, want a bad-input error on roastLevel", err)
				}
				return
			}
			s := "nil"
			if got != nil {
				s = *got
			}
			if err != nil || s != tt.want {
				t.Fatalf("got (%s, %v), want %s", s, err, tt.want)
			}
			if back := toRoastLevel(got); (back == nil) != (tt.in == nil) || (back != nil && *back != *tt.in) {
				t.Fatalf("round trip: got %v, want %v", back, tt.in)
			}
		})
	}
}

func TestBrewMethodParam(t *testing.T) {
	m := func(v string) *model.BrewMethod { b := model.BrewMethod(v); return &b }
	for _, tt := range []struct {
		name string
		in   *model.BrewMethod
		want string // "nil" = not given
		fail bool
	}{
		{"not given", nil, "nil", false},
		{"filter", m("FILTER"), "FILTER", false},
		{"espresso", m("ESPRESSO"), "ESPRESSO", false},
		{"omni", m("OMNI"), "OMNI", false},
		{"lower case", m("filter"), "", true},
		{"unknown", m("COLD_BREW"), "", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := brewMethodParam(tt.in)
			if tt.fail {
				if ae, ok := err.(*apiError); !ok || ae.field != "brewMethod" {
					t.Fatalf("got %v, want a bad-input error on brewMethod", err)
				}
				return
			}
			s := "nil"
			if got != nil {
				s = *got
			}
			if err != nil || s != tt.want {
				t.Fatalf("got (%s, %v), want %s", s, err, tt.want)
			}
			// And back: the stored value maps to the same enum.
			if back := toBrewMethod(got); (back == nil) != (tt.in == nil) || (back != nil && *back != *tt.in) {
				t.Fatalf("round trip: got %v, want %v", back, tt.in)
			}
		})
	}
	bad := "COLD_BREW"
	if toBrewMethod(&bad) != nil {
		t.Fatal("an unknown stored value should read as not given")
	}
}

func TestBrewMethodsMatching(t *testing.T) {
	for _, tt := range []struct {
		in   model.BrewMethod
		want []string
	}{
		{model.BrewMethodFilter, []string{"FILTER", "OMNI"}},
		{model.BrewMethodEspresso, []string{"ESPRESSO", "OMNI"}},
		{model.BrewMethodOmni, []string{"OMNI"}},
	} {
		if got := brewMethodsMatching(tt.in); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("brewMethodsMatching(%s) = %v, want %v", tt.in, got, tt.want)
		}
		f, err := storeFilter(&model.CoffeeFilter{BrewMethod: &tt.in})
		if err != nil || !reflect.DeepEqual(f.BrewMethods, tt.want) {
			t.Errorf("storeFilter brewMethod %s: %v %v", tt.in, f.BrewMethods, err)
		}
	}
	bad := model.BrewMethod("COLD_BREW")
	if _, err := storeFilter(&model.CoffeeFilter{BrewMethod: &bad}); err == nil {
		t.Error("unknown brew method accepted")
	}
	if f, _ := storeFilter(&model.CoffeeFilter{}); f.BrewMethods != nil {
		t.Errorf("no brew method should mean no filter, got %v", f.BrewMethods)
	}
}

func TestValidateHarvestYear(t *testing.T) {
	y := func(v int) *int { return &v }
	// 2026-12-31 16:30 UTC is already 2027-01-01 in Taipei.
	newYearsEve := time.Date(2026, 12, 31, 16, 30, 0, 0, time.UTC)
	midYear := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		name string
		in   *int
		now  time.Time
		ok   bool
	}{
		{"not given", nil, midYear, true},
		{"earliest", y(2000), midYear, true},
		{"this year", y(2026), midYear, true},
		{"next year", y(2027), midYear, false},
		{"next year once Taipei is in it", y(2027), newYearsEve, true},
		{"too old", y(1999), midYear, false},
		{"two digits", y(25), midYear, false},
		{"negative", y(-2025), midYear, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHarvestYear("harvestYear", tt.in, tt.now)
			if tt.ok {
				if err != nil {
					t.Fatalf("got %v, want ok", err)
				}
				return
			}
			if ae, ok := err.(*apiError); !ok || ae.field != "harvestYear" {
				t.Fatalf("got %v, want a bad-input error on harvestYear", err)
			}
		})
	}
}
