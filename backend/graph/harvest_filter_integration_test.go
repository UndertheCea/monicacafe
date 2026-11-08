package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeesHarvestYearFilter: CoffeeFilter.minHarvestYear on Query.coffees
// and Shop.coffees — this year or later, coffees without a harvest year never
// match, out-of-range years are BAD_USER_INPUT. Requires TEST_DATABASE_URL.
func TestCoffeesHarvestYearFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "harvestfilter+"+run+"@example.com")
	slug := "harvestfilter-" + run
	shopName := "HarvestFilter" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": shopName, "description": "", "city": "高雄市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	for _, c := range []struct {
		name    string
		year    int // 0 = not given
		publish bool
	}{
		{"Y2023", 2023, true}, {"Y2024", 2024, true}, {"Y2025", 2025, true}, {"N", 0, true},
		{"Draft2025", 2025, false},
	} {
		in := map[string]any{
			"name": c.name, "description": "", "roastLevel": "MEDIUM",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}
		if c.year != 0 {
			in["harvestYear"] = c.year
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
		year            int // 0 = no filter
		want, wantOwner string
	}{
		{0, "N,Y2023,Y2024,Y2025", "Draft2025,N,Y2023,Y2024,Y2025"},
		{2000, "Y2023,Y2024,Y2025", "Draft2025,Y2023,Y2024,Y2025"},
		{2024, "Y2024,Y2025", "Draft2025,Y2024,Y2025"},
		{2025, "Y2025", "Draft2025,Y2025"},
		{2026, "", ""},
	} {
		f := map[string]any{"search": shopName}
		sf := map[string]any{}
		if tt.year != 0 {
			f["minHarvestYear"], sf["minHarvestYear"] = tt.year, tt.year
		}
		var all struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`, map[string]any{"f": f}, &all)
		if got := names(all.Coffees.Nodes); got != tt.want || all.Coffees.Total != len(all.Coffees.Nodes) {
			t.Errorf("coffees from %d: got %s (total %d), want %s", tt.year, got, all.Coffees.Total, tt.want)
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
				t.Errorf("shop coffees from %d: got %s, want %s", tt.year, got, v.want)
			}
		}
	}

	for _, y := range []int{1999, 2101} {
		r := anon.do(`query($f: CoffeeFilter) { coffees(filter: $f) { total } }`, map[string]any{"f": map[string]any{"minHarvestYear": y}}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "minHarvestYear" {
			t.Errorf("minHarvestYear %d: got %+v, want BAD_USER_INPUT", y, r.Errors)
		}
	}
}
