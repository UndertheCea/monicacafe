package graph_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeesAcidityFilter: CoffeeFilter.maxAcidity on Query.coffees
// and Shop.coffees — this acidity or lower, coffees without an acidity never
// match, values outside 1–5 are BAD_USER_INPUT. Requires TEST_DATABASE_URL.
func TestCoffeesAcidityFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "acidfilter+"+run+"@example.com")
	slug := "acidfilter-" + run
	shopName := "AcidFilter" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": shopName, "description": "", "city": "新竹市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	for _, c := range []struct {
		name    string
		acidity int // 0 = not given
		publish bool
	}{
		{"A1", 1, true}, {"A2", 2, true}, {"A4", 4, true}, {"N", 0, true},
		{"Draft1", 1, false},
	} {
		in := map[string]any{
			"name": c.name, "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}
		if c.acidity != 0 {
			in["cupProfile"] = map[string]any{"acidity": c.acidity, "body": 3}
		} else {
			in["cupProfile"] = map[string]any{"sweetness": 4} // a profile without acidity
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
		acidity         int // 0 = no filter
		want, wantOwner string
	}{
		{0, "A1,A2,A4,N", "A1,A2,A4,Draft1,N"},
		{5, "A1,A2,A4", "A1,A2,A4,Draft1"},
		{2, "A1,A2", "A1,A2,Draft1"},
		{1, "A1", "A1,Draft1"},
	} {
		f := map[string]any{"search": shopName}
		sf := map[string]any{}
		if tt.acidity != 0 {
			f["maxAcidity"], sf["maxAcidity"] = tt.acidity, tt.acidity
		}
		var all struct {
			Coffees struct {
				Total int
				Nodes []struct{ Name string }
			}
		}
		anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, limit: 50) { total nodes { name } } }`, map[string]any{"f": f}, &all)
		if got := names(all.Coffees.Nodes); got != tt.want || all.Coffees.Total != len(all.Coffees.Nodes) {
			t.Errorf("coffees ≤ %d: got %s (total %d), want %s", tt.acidity, got, all.Coffees.Total, tt.want)
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
				t.Errorf("shop coffees ≤ %d: got %s, want %s", tt.acidity, got, v.want)
			}
		}
	}

	for _, a := range []int{0, 6} {
		r := anon.do(`query($f: CoffeeFilter) { coffees(filter: $f) { total } }`, map[string]any{"f": map[string]any{"maxAcidity": a}}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "maxAcidity" {
			t.Errorf("maxAcidity %d: got %+v, want BAD_USER_INPUT", a, r.Errors)
		}
	}
}
