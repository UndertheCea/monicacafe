package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestShopSearch: shops(search:) needs every word in the name or description
// (case-insensitive, wildcards literal), never matches on city, keeps the
// total in step and works with every sort. Requires TEST_DATABASE_URL.
func TestShopSearch(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("q%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}

	// Created in this order (oldest first).
	shops := []struct{ name, desc, city string }{
		{"Alpha " + run, "淺焙 single origin", "台北市"},
		{"Beta 烘焙 " + run, "100% 水洗", "台中市"},
		{"Gamma " + run, "deep roast", "台南市"},
	}
	for i, sh := range shops {
		c, _ := register(t, url, fmt.Sprintf("shopsearch%d+%s@example.com", i, run))
		var created struct{ CreateShop struct{ ID string } }
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"slug": fmt.Sprintf("search-%d-%s", i, run), "name": sh.name, "description": sh.desc, "city": sh.city,
			}}, &created)
		publishTestCoffee(t, pool, created.CreateShop.ID)
	}

	const q = `query($s: String, $sort: ShopSort, $l: Int) { shops(search: $s, sort: $sort, limit: $l) { total nodes { name } } }`
	tests := []struct {
		search string
		sort   any
		limit  int
		want   string // first word of each name
		total  int
	}{
		{run, nil, 10, "Gamma,Beta,Alpha", 3},
		{strings.ToUpper(run), "NAME", 10, "Alpha,Beta,Gamma", 3},
		{run + " ROAST", nil, 10, "Gamma", 1},
		{run + " 焙", nil, 10, "Beta,Alpha", 2}, // Beta by name, Alpha by description
		{"  " + run + "   single  ", nil, 10, "Alpha", 1},
		{run + " 100%", nil, 10, "Beta", 1},
		{run + " 10_%", nil, 10, "", 0},           // _ is literal, not a wildcard
		{run + " 台北市", nil, 10, "", 0},            // city is not searched
		{run, "MOST_COFFEES", 2, "Gamma,Beta", 3}, // one coffee each → newest first
	}
	for _, tt := range tests {
		t.Run(tt.search, func(t *testing.T) {
			anon.t = t
			var out struct {
				Shops struct {
					Total int
					Nodes []struct{ Name string }
				}
			}
			anon.mustDo(q, map[string]any{"s": tt.search, "sort": tt.sort, "l": tt.limit}, &out)
			var got []string
			for _, n := range out.Shops.Nodes {
				got = append(got, strings.Fields(n.Name)[0])
			}
			if strings.Join(got, ",") != tt.want || out.Shops.Total != tt.total {
				t.Errorf("got %v (total %d), want %s (total %d)", got, out.Shops.Total, tt.want, tt.total)
			}
		})
	}
	anon.t = t

	// Blank search is ignored; too long / too many words is rejected.
	var all struct{ Shops struct{ Total int } }
	anon.mustDo(`{ shops(search: "   ") { total } }`, nil, &all)
	var none struct{ Shops struct{ Total int } }
	anon.mustDo(`{ shops { total } }`, nil, &none)
	if all.Shops.Total != none.Shops.Total {
		t.Errorf("blank search total %d, unfiltered %d", all.Shops.Total, none.Shops.Total)
	}
	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"s": strings.Repeat("a", 101)})
	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"s": "a b c d e f g h i"})
}
