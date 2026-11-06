package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestCoffeeSearch: CoffeeFilter.search matches every word against names,
// notes, the shop and reference names, literally, and never returns drafts.
// Requires TEST_DATABASE_URL.
func TestCoffeeSearch(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	tok := "tok" + run // in every coffee name: isolates this run's coffees
	seller, _ := register(t, url, "search+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "search-" + run, "name": "山嵐" + run, "description": "", "city": "台北市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID, NameEn, NameZh string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id nameEn nameZh } processingMethods { id } }`, nil, &refs)

	create := func(name, desc string, notes []string, publish bool) {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": desc, "roastLevel": "LIGHT", "flavorNotes": notes,
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		if publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
	}
	create("耶加雪菲 Alpha "+tok, "", []string{"Jasmine", "柑橘"}, true)
	create("Beta "+tok, "100% washed", nil, true)
	create("耶加雪菲 Draft "+tok, "", []string{"Jasmine"}, false)

	const q = `query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`
	search := func(s string) []string {
		var out struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(q, map[string]any{"f": map[string]any{"search": s}}, &out)
		var names []string
		for _, n := range out.Coffees.Nodes {
			names = append(names, strings.Fields(n.Name)[len(strings.Fields(n.Name))-2])
		}
		if out.Coffees.Total != len(names) {
			t.Fatalf("%q: total %d but %d nodes", s, out.Coffees.Total, len(names))
		}
		sort.Strings(names)
		return names
	}
	origin := refs.OriginCountries[0]
	for _, tc := range []struct {
		search string
		want   string
	}{
		{tok, "Alpha,Beta"},                          // drafts never match
		{"耶加雪菲 " + tok, "Alpha"},                     // zh name, multi-word AND
		{strings.ToUpper(tok) + " jasmine", "Alpha"}, // case-insensitive, flavor note
		{tok + " 柑橘", "Alpha"},
		{tok + " WASHED", "Beta"},                   // description
		{tok + " 100%", "Beta"},                     // % is literal
		{tok + " 10_", ""},                          // _ is literal
		{tok + " 山嵐" + run, "Alpha,Beta"},           // shop name
		{tok + " " + origin.NameZh, "Alpha,Beta"},   // origin (zh)
		{tok + " " + origin.NameEn, "Alpha,Beta"},   // origin (en)
		{tok + " " + tok + " " + tok, "Alpha,Beta"}, // duplicate words count once
		{tok + " nomatch", ""},
	} {
		if got := strings.Join(search(tc.search), ","); got != tc.want {
			t.Errorf("search %q = %q, want %q", tc.search, got, tc.want)
		}
	}

	// Blank is ignored (same total as no filter).
	var all, blank struct{ Coffees struct{ Total int } }
	anon.mustDo(`{ coffees { total } }`, nil, &all)
	anon.mustDo(q, map[string]any{"f": map[string]any{"search": "   "}}, &blank)
	if blank.Coffees.Total != all.Coffees.Total {
		t.Errorf("blank search total %d, want %d", blank.Coffees.Total, all.Coffees.Total)
	}

	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"f": map[string]any{"search": strings.Repeat("咖", 101)}})
	anon.expectCode("BAD_USER_INPUT", q, map[string]any{"f": map[string]any{"search": "a b c d e f g h i"}})
}
