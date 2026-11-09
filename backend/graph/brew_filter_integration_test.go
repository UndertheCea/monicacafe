package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestCoffeesBrewMethodFilter: CoffeeFilter.brewMethod on Query.coffees and
// Shop.coffees — filter / espresso also match omni, omni matches only omni,
// coffees without a brew method never match. Requires TEST_DATABASE_URL.
func TestCoffeesBrewMethodFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "brewfilter+"+run+"@example.com")
	slug := "brewfilter-" + run
	shopName := "BrewFilter" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": shopName, "description": "", "city": "高雄市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	for _, c := range []struct {
		name, brew string
		publish    bool
	}{
		{"F", "FILTER", true}, {"E", "ESPRESSO", true}, {"O", "OMNI", true}, {"N", "", true},
		{"DraftE", "ESPRESSO", false},
	} {
		in := map[string]any{
			"name": c.name, "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}
		if c.brew != "" {
			in["brewMethod"] = c.brew
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
	for _, tt := range []struct{ brew, want, wantOwner string }{
		{"", "E,F,N,O", "DraftE,E,F,N,O"},
		{"FILTER", "F,O", "F,O"},
		{"ESPRESSO", "E,O", "DraftE,E,O"},
		{"OMNI", "O", "O"},
	} {
		f := map[string]any{"search": shopName}
		sf := map[string]any{}
		if tt.brew != "" {
			f["brewMethod"], sf["brewMethod"] = tt.brew, tt.brew
		}
		var all struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`, map[string]any{"f": f}, &all)
		if got := names(all.Coffees.Nodes); got != tt.want || all.Coffees.Total != len(all.Coffees.Nodes) {
			t.Errorf("coffees brew %q: got %s (total %d), want %s", tt.brew, got, all.Coffees.Total, tt.want)
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
				t.Errorf("shop coffees brew %q: got %s, want %s", tt.brew, got, v.want)
			}
		}
	}

	r := anon.do(`{ coffees(filter: {brewMethod: COLD_BREW}) { total } }`, nil, nil)
	if len(r.Errors) == 0 {
		t.Error("unknown brew method accepted")
	}
}
