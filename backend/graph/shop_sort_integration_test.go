package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestShopCoffeesSort: Shop.coffees takes the same sort as Query.coffees,
// including sold-out last for price sorts. Requires TEST_DATABASE_URL.
func TestShopCoffeesSort(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "sortshop+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	slug := "sort-shop-" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "排序", "description": "", "city": "高雄市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	// Created oldest → newest: Mid, Cheap, Pricey, SoldOut (cheapest price, no stock).
	for _, c := range []struct {
		name         string
		price, stock int
	}{{"Mid", 500, 2}, {"Cheap", 300, 2}, {"Pricey", 900, 2}, {"SoldOut", 100, 0}} {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": withEssentials(t, map[string]any{
				"name": c.name, "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": c.price, "stock": c.stock}},
			})}, &out)
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
	}

	tests := []struct {
		sort  any // nil = argument omitted
		limit int
		want  string
	}{
		{nil, 10, "Mid,Cheap,Pricey,SoldOut"}, // SHOP_ORDER: new coffees join at the end (#161)
		{"SHOP_ORDER", 10, "Mid,Cheap,Pricey,SoldOut"},
		{"NEWEST", 10, "SoldOut,Pricey,Cheap,Mid"},
		{"PRICE_ASC", 10, "Cheap,Mid,Pricey,SoldOut"},
		{"PRICE_DESC", 10, "Pricey,Mid,Cheap,SoldOut"},
		{"PRICE_ASC", 2, "Cheap,Mid"},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("%v/%d", tt.sort, tt.limit), func(t *testing.T) {
			anon.t = t
			var out struct {
				Shop struct {
					Coffees struct {
						Total int
						Nodes []struct{ Name string }
					}
				}
			}
			anon.mustDo(`query($slug: String!, $sort: CoffeeSort, $limit: Int) {
				shop(slug: $slug) { coffees(sort: $sort, limit: $limit) { total nodes { name } } } }`,
				map[string]any{"slug": slug, "sort": tt.sort, "limit": tt.limit}, &out)
			names := make([]string, 0, len(out.Shop.Coffees.Nodes))
			for _, n := range out.Shop.Coffees.Nodes {
				names = append(names, n.Name)
			}
			if got := strings.Join(names, ","); got != tt.want || out.Shop.Coffees.Total != 4 {
				t.Fatalf("got %s (total %d), want %s (total 4)", got, out.Shop.Coffees.Total, tt.want)
			}
		})
	}
}
