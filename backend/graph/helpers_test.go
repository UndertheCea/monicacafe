package graph

import (
	"strings"
	"testing"

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
	}
	for _, tc := range tests {
		l, o := page(tc.limit, tc.offset)
		if l != tc.l || o != tc.o {
			t.Errorf("page(%v,%v) = %d,%d want %d,%d", tc.limit, tc.offset, l, o, tc.l, tc.o)
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
