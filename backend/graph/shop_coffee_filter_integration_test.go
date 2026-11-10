package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestShopCoffeesFilter: Shop.coffees(filter:) narrows one shop's coffees with
// the same rules as Query.coffees, never leaks another shop's coffees, still
// shows drafts to the owner only, and rejects bad filters the same way.
// Requires TEST_DATABASE_URL.
func TestShopCoffeesFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type coffee struct {
		name, roast, desc string
		publish           bool
	}
	open := func(i int, list []coffee) (*gqlClient, string) {
		c, _ := register(t, url, fmt.Sprintf("shopfilter%d+%s@example.com", i, run))
		slug := fmt.Sprintf("filter-%d-%s", i, run)
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": slug, "name": "篩選 " + run, "description": "", "city": "新竹市"}}, nil)
		for _, co := range list {
			var out struct{ CreateCoffee struct{ ID string } }
			c.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
				map[string]any{"in": withEssentials(t, map[string]any{
					"name": co.name, "description": co.desc, "roastLevel": co.roast, "flavorNotes": []string{"Citrus"},
					"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
					"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
				})}, &out)
			if co.publish {
				c.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
			}
		}
		return c, slug
	}
	owner, slug := open(0, []coffee{
		{"Jasmine", "LIGHT", "花香 berry", true},
		{"Berry Bomb", "LIGHT", "果醬", true},
		{"Choco", "DARK", "berry finish", true},
		{"Draft Berry", "LIGHT", "", false},
	})
	open(1, []coffee{{"Other Berry", "LIGHT", "berry", true}})

	const q = `query($s: String!, $f: CoffeeFilter) { shop(slug: $s) { coffees(filter: $f) { total nodes { name } } } }`
	get := func(c *gqlClient, f map[string]any) (int, string) {
		var out struct {
			Shop struct {
				Coffees struct {
					Total int
					Nodes []struct{ Name string }
				}
			}
		}
		c.mustDo(q, map[string]any{"s": slug, "f": f}, &out)
		var names []string
		for _, n := range out.Shop.Coffees.Nodes {
			names = append(names, n.Name)
		}
		sort.Strings(names)
		return out.Shop.Coffees.Total, strings.Join(names, ",")
	}

	tests := []struct {
		name   string
		viewer *gqlClient
		filter map[string]any
		want   string
	}{
		{"no filter", anon, nil, "Berry Bomb,Choco,Jasmine"},
		{"search name or description", anon, map[string]any{"search": "BERRY"}, "Berry Bomb,Choco,Jasmine"},
		{"search two words", anon, map[string]any{"search": "berry light"}, ""}, // roast isn't searched
		{"roast", anon, map[string]any{"roastLevel": "LIGHT"}, "Berry Bomb,Jasmine"},
		{"roast + search", anon, map[string]any{"roastLevel": "LIGHT", "search": "果醬"}, "Berry Bomb"},
		{"owner sees matching draft", owner, map[string]any{"roastLevel": "LIGHT", "search": "berry"}, "Berry Bomb,Draft Berry,Jasmine"},
		{"no match", anon, map[string]any{"search": "zzz" + run}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.viewer.t = t
			defer func() { tt.viewer.t = nil }()
			total, got := get(tt.viewer, tt.filter)
			wantTotal := 0
			if tt.want != "" {
				wantTotal = len(strings.Split(tt.want, ","))
			}
			if got != tt.want || total != wantTotal {
				t.Errorf("got %q (total %d), want %q (total %d)", got, total, tt.want, wantTotal)
			}
		})
	}
	anon.t, owner.t = t, t

	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"s": slug, "f": map[string]any{"originCountryId": "nope"}})
	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"s": slug, "f": map[string]any{"search": strings.Repeat("x", 101)}})
}
