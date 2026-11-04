package store

import (
	"reflect"
	"strings"
	"testing"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

func ptr[T any](v T) *T { return &v }

func TestPage(t *testing.T) {
	tests := []struct {
		name          string
		limit, offset *int
		wantL, wantO  int
	}{
		{"defaults", nil, nil, DefaultLimit, 0},
		{"explicit", ptr(5), ptr(10), 5, 10},
		{"zero limit → default", ptr(0), nil, DefaultLimit, 0},
		{"negative → default/0", ptr(-3), ptr(-1), DefaultLimit, 0},
		{"capped", ptr(1000), nil, MaxLimit, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, o := Page(tt.limit, tt.offset)
			if l != tt.wantL || o != tt.wantO {
				t.Errorf("Page() = (%d,%d), want (%d,%d)", l, o, tt.wantL, tt.wantO)
			}
		})
	}
}

func TestEscapeLike(t *testing.T) {
	tests := []struct{ in, want string }{
		{"jasmine", "jasmine"},
		{"100%", `100\%`},
		{"a_b", `a\_b`},
		{`back\slash`, `back\\slash`},
		{"茉莉花", "茉莉花"},
	}
	for _, tt := range tests {
		if got := escapeLike(tt.in); got != tt.want {
			t.Errorf("escapeLike(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestBuildCoffeeWhere(t *testing.T) {
	light := model.RoastLevelLight
	tests := []struct {
		name     string
		q        CoffeeQuery
		wantSQL  []string // substrings that must appear, in order
		wantArgs []any
	}{
		{
			name: "no filter",
			q:    CoffeeQuery{},
		},
		{
			name:    "published only",
			q:       CoffeeQuery{OnlyPub: true},
			wantSQL: []string{" WHERE c.is_published"},
		},
		{
			name: "shop + origin + roast",
			q: CoffeeQuery{OnlyPub: true, ShopID: "s1", Filter: &model.CoffeeFilter{
				OriginCountryID: ptr("o1"), RoastLevel: &light,
			}},
			wantSQL:  []string{"c.is_published", "c.shop_id = $1::uuid", "c.origin_country_id = $2::uuid", "c.roast_level = $3::roast_level"},
			wantArgs: []any{"s1", "o1", "LIGHT"},
		},
		{
			name:     "empty-string ids ignored",
			q:        CoffeeQuery{Filter: &model.CoffeeFilter{VarietyID: ptr(""), ProcessingMethodID: ptr("p1")}},
			wantSQL:  []string{"c.processing_method_id = $1::uuid"},
			wantArgs: []any{"p1"},
		},
		{
			name:     "flavor note escaped and trimmed",
			q:        CoffeeQuery{Filter: &model.CoffeeFilter{FlavorNote: ptr("  50%  ")}},
			wantSQL:  []string{"unnest(c.flavor_notes)", "ILIKE '%' || $1 || '%'"},
			wantArgs: []any{`50\%`},
		},
		{
			name:     "price range uses one variant",
			q:        CoffeeQuery{Filter: &model.CoffeeFilter{MinPriceTwd: ptr(300), MaxPriceTwd: ptr(600)}},
			wantSQL:  []string{"EXISTS (SELECT 1 FROM variants v", "v.is_available", "v.price_twd >= $1 AND v.price_twd <= $2)"},
			wantArgs: []any{300, 600},
		},
		{
			name:     "max price only",
			q:        CoffeeQuery{Filter: &model.CoffeeFilter{MaxPriceTwd: ptr(450)}},
			wantSQL:  []string{"v.price_twd <= $1)"},
			wantArgs: []any{450},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql, args := buildCoffeeWhere(tt.q)
			if len(tt.wantSQL) == 0 && sql != "" {
				t.Errorf("expected empty WHERE, got %q", sql)
			}
			rest := sql
			for _, frag := range tt.wantSQL {
				i := strings.Index(rest, frag)
				if i < 0 {
					t.Fatalf("WHERE %q missing %q (in order)", sql, frag)
				}
				rest = rest[i+len(frag):]
			}
			if !reflect.DeepEqual(args, tt.wantArgs) {
				t.Errorf("args = %#v, want %#v", args, tt.wantArgs)
			}
		})
	}
}
