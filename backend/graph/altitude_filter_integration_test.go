package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeesAltitudeFilter: CoffeeFilter.minAltitudeM on Query.coffees and
// Shop.coffees — judged by the top of the range (or the single height),
// coffees without an altitude never match, out-of-range values are
// BAD_USER_INPUT. Requires TEST_DATABASE_URL.
func TestCoffeesAltitudeFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "altfilter+"+run+"@example.com")
	slug := "altfilter-" + run
	shopName := "AltFilter" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": shopName, "description": "", "city": "嘉義市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	for _, c := range []struct {
		name     string
		min, max int // 0 = not given
		publish  bool
	}{
		{"H1600", 1600, 0, true},         // single height
		{"R1200-1800", 1200, 1800, true}, // range reaching high
		{"R1000-1400", 1000, 1400, true},
		{"N", 0, 0, true},
		{"Draft2000", 2000, 0, false},
	} {
		in := map[string]any{
			"name": c.name, "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 450, "stock": 2}},
		}
		if c.min != 0 {
			in["altitudeMinM"] = c.min
		}
		if c.max != 0 {
			in["altitudeMaxM"] = c.max
		}
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`, map[string]any{"in": in}, &out)
		if c.publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
	}

	names := func(nodes []struct{ Name string }) string {
		var out []string
		for _, n := range nodes {
			out = append(out, n.Name)
		}
		sort.Strings(out)
		return strings.Join(out, ",")
	}
	for _, tt := range []struct {
		min             int // -1 = no filter
		want, wantOwner string
	}{
		{-1, "H1600,N,R1000-1400,R1200-1800", "Draft2000,H1600,N,R1000-1400,R1200-1800"},
		{0, "H1600,R1000-1400,R1200-1800", "Draft2000,H1600,R1000-1400,R1200-1800"},
		{1400, "H1600,R1000-1400,R1200-1800", "Draft2000,H1600,R1000-1400,R1200-1800"},
		{1500, "H1600,R1200-1800", "Draft2000,H1600,R1200-1800"},
		{1700, "R1200-1800", "Draft2000,R1200-1800"},
		{2500, "", ""},
	} {
		f := map[string]any{"search": shopName}
		sf := map[string]any{}
		if tt.min >= 0 {
			f["minAltitudeM"], sf["minAltitudeM"] = tt.min, tt.min
		}
		var all struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`, map[string]any{"f": f}, &all)
		if got := names(all.Coffees.Nodes); got != tt.want || all.Coffees.Total != len(all.Coffees.Nodes) {
			t.Errorf("coffees ≥ %d m: got %s (total %d), want %s", tt.min, got, all.Coffees.Total, tt.want)
		}
		for _, v := range []struct {
			c    *gqlClient
			want string
		}{{anon, tt.want}, {seller, tt.wantOwner}} {
			var shop struct {
				Shop struct {
					Coffees struct{ Nodes []struct{ Name string } }
				}
			}
			v.c.mustDo(`query($s: String!, $f: CoffeeFilter) { shop(slug: $s) { coffees(filter: $f) { nodes { name } } } }`,
				map[string]any{"s": slug, "f": sf}, &shop)
			if got := names(shop.Shop.Coffees.Nodes); got != v.want {
				t.Errorf("shop coffees ≥ %d m: got %s, want %s", tt.min, got, v.want)
			}
		}
	}

	for _, m := range []int{-1, 6001} {
		r := anon.do(`query($f: CoffeeFilter) { coffees(filter: $f) { total } }`, map[string]any{"f": map[string]any{"minAltitudeM": m}}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "minAltitudeM" {
			t.Errorf("minAltitudeM %d: got %+v, want BAD_USER_INPUT", m, r.Errors)
		}
	}
}
