package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeesSweetnessBodyFilter: CoffeeFilter.minSweetness / minBody /
// maxBody on Query.coffees and Shop.coffees — coffees without that scale
// never match, out-of-range or inverted bounds are BAD_USER_INPUT.
// Requires TEST_DATABASE_URL.
func TestCoffeesSweetnessBodyFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "sweetbody+"+run+"@example.com")
	slug := "sweetbody-" + run
	shopName := "SweetBody" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": shopName, "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	for _, c := range []struct {
		name    string
		profile map[string]any // nil = no cup profile
		publish bool
	}{
		{"S5B1", map[string]any{"sweetness": 5, "body": 1}, true},
		{"S4B4", map[string]any{"sweetness": 4, "body": 4}, true},
		{"S2B5", map[string]any{"sweetness": 2, "body": 5}, true},
		{"A3", map[string]any{"acidity": 3}, true}, // neither sweetness nor body
		{"N", nil, true},
		{"DraftS5B5", map[string]any{"sweetness": 5, "body": 5}, false},
	} {
		in := map[string]any{
			"name": c.name, "description": "", "roastLevel": "MEDIUM",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}
		if c.profile != nil {
			in["cupProfile"] = c.profile
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
		name            string
		filter          map[string]any
		want, wantOwner string
	}{
		{"none", map[string]any{}, "A3,N,S2B5,S4B4,S5B1", "A3,DraftS5B5,N,S2B5,S4B4,S5B1"},
		{"sweet ≥ 4", map[string]any{"minSweetness": 4}, "S4B4,S5B1", "DraftS5B5,S4B4,S5B1"},
		{"sweet ≥ 1", map[string]any{"minSweetness": 1}, "S2B5,S4B4,S5B1", "DraftS5B5,S2B5,S4B4,S5B1"},
		{"light body", map[string]any{"maxBody": 2}, "S5B1", "S5B1"},
		{"full body", map[string]any{"minBody": 4}, "S2B5,S4B4", "DraftS5B5,S2B5,S4B4"},
		{"sweet + full", map[string]any{"minSweetness": 4, "minBody": 4}, "S4B4", "DraftS5B5,S4B4"},
		{"body 4–4", map[string]any{"minBody": 4, "maxBody": 4}, "S4B4", "S4B4"},
	} {
		f := map[string]any{"search": shopName}
		for k, v := range tt.filter {
			f[k] = v
		}
		var all struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`, map[string]any{"f": f}, &all)
		if got := names(all.Coffees.Nodes); got != tt.want || all.Coffees.Total != len(all.Coffees.Nodes) {
			t.Errorf("coffees %s: got %s (total %d), want %s", tt.name, got, all.Coffees.Total, tt.want)
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
				map[string]any{"s": slug, "f": tt.filter}, &shop)
			if got := names(shop.Shop.Coffees.Nodes); got != v.want {
				t.Errorf("shop coffees %s: got %s, want %s", tt.name, got, v.want)
			}
		}
	}

	for _, tc := range []struct {
		filter map[string]any
		field  string
	}{
		{map[string]any{"minSweetness": 0}, "minSweetness"},
		{map[string]any{"minSweetness": 6}, "minSweetness"},
		{map[string]any{"minBody": 6}, "minBody"},
		{map[string]any{"maxBody": 0}, "maxBody"},
		{map[string]any{"minBody": 5, "maxBody": 1}, "minBody"},
	} {
		r := anon.do(`query($f: CoffeeFilter) { coffees(filter: $f) { total } }`, map[string]any{"f": tc.filter}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != tc.field {
			t.Errorf("%v: got %+v, want BAD_USER_INPUT on %s", tc.filter, r.Errors, tc.field)
		}
	}
}
