package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestShopArchiveFilter: inStock false lists only sold-out coffees (no
// available option with stock), true only buyable ones, null both; each list
// keeps the shop's order (#163). Requires TEST_DATABASE_URL.
func TestShopArchiveFilter(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "archive+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	slug := "archive-" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "封存測試", "description": "", "city": "高雄市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	// Fresh: in stock. Empty: stock 0. Hidden: stock but unavailable.
	// Mixed: one empty option, one in stock.
	type opt struct {
		stock     int
		available bool
	}
	for _, co := range []struct {
		name string
		opts []opt
	}{
		{"Fresh", []opt{{5, true}}},
		{"Empty", []opt{{0, true}}},
		{"Hidden", []opt{{5, false}}},
		{"Mixed", []opt{{0, true}, {2, true}}},
	} {
		var vs []map[string]any
		for i, o := range co.opts {
			vs = append(vs, map[string]any{"grind": "WHOLE_BEAN", "weightG": 100 * (i + 1), "priceTwd": 400, "stock": o.stock})
		}
		var out struct {
			CreateCoffee struct {
				ID       string
				Variants []struct{ ID string }
			}
		}
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id variants { id } } }`,
			map[string]any{"in": map[string]any{
				"name": co.name, "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": vs,
			}}, &out)
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		for i, o := range co.opts {
			if !o.available {
				seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: { isAvailable: false }) { id } }`,
					map[string]any{"id": out.CreateCoffee.Variants[i].ID}, nil)
			}
		}
	}

	for _, tt := range []struct {
		inStock any
		want    string
	}{
		{nil, "Fresh,Empty,Hidden,Mixed"},
		{true, "Fresh,Mixed"},
		{false, "Empty,Hidden"},
	} {
		var out struct {
			Shop struct {
				Coffees struct {
					Total int
					Nodes []struct{ Name string }
				}
			}
		}
		anon.mustDo(`query($s: String!, $in: Boolean) { shop(slug: $s) { coffees(filter: { inStock: $in }) { total nodes { name } } } }`,
			map[string]any{"s": slug, "in": tt.inStock}, &out)
		var names []string
		for _, n := range out.Shop.Coffees.Nodes {
			names = append(names, n.Name)
		}
		if got := strings.Join(names, ","); got != tt.want || out.Shop.Coffees.Total != len(names) {
			t.Errorf("inStock %v: got %q (total %d), want %q", tt.inStock, got, out.Shop.Coffees.Total, tt.want)
		}
	}
}
