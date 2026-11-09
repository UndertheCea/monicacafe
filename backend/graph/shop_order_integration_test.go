package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestReorderShopCoffees: the owner sets the lineup order (drafts included),
// Shop.coffees follows it by default, and new or duplicated coffees join at
// the end (#161). Requires TEST_DATABASE_URL.
func TestReorderShopCoffees(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())

	seller, _ := register(t, url, "orderseller+"+run+"@example.com")
	other, _ := register(t, url, "orderother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	slug := "order-" + run
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "排序測試", "description": "", "city": "台中市"}}, &shop)
	shopID := shop.CreateShop.ID
	other.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "order-other-" + run, "name": "別家", "description": "", "city": "台中市"}}, nil)

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	create := func(c *gqlClient, name string) string {
		var out struct{ CreateCoffee struct{ ID string } }
		c.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		return out.CreateCoffee.ID
	}
	a, b, d := create(seller, "A"), create(seller, "B"), create(seller, "D")
	foreign := create(other, "X")
	for _, id := range []string{a, b} { // d stays a draft
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": id}, nil)
	}

	names := func(c *gqlClient, sort string) string {
		var out struct {
			Shop struct {
				Coffees struct{ Nodes []struct{ Name string } }
			}
		}
		q := `query($slug: String!) { shop(slug: $slug) { coffees { nodes { name } } } }`
		if sort != "" {
			q = `query($slug: String!) { shop(slug: $slug) { coffees(sort: ` + sort + `) { nodes { name } } } }`
		}
		c.mustDo(q, map[string]any{"slug": slug}, &out)
		var ns []string
		for _, n := range out.Shop.Coffees.Nodes {
			ns = append(ns, n.Name)
		}
		return strings.Join(ns, ",")
	}
	if got := names(seller, ""); got != "A,B,D" {
		t.Fatalf("new coffees should join at the end: %q", got)
	}

	const reorder = `mutation($shop: ID!, $ids: [ID!]!) { reorderShopCoffees(shopId: $shop, coffeeIds: $ids) { id } }`
	for _, tt := range []struct {
		name   string
		client *gqlClient
		shop   string
		ids    []string
		code   string
	}{
		{"anonymous", anon, shopID, []string{d, b, a}, graph.CodeUnauthenticated},
		{"another seller", other, shopID, []string{d, b, a}, graph.CodeForbidden},
		{"unknown shop", seller, "00000000-0000-0000-0000-000000000000", []string{d, b, a}, graph.CodeNotFound},
		{"missing the draft", seller, shopID, []string{b, a}, graph.CodeBadInput},
		{"duplicate", seller, shopID, []string{d, b, b}, graph.CodeBadInput},
		{"another shop's coffee", seller, shopID, []string{d, b, foreign}, graph.CodeBadInput},
		{"malformed id", seller, shopID, []string{d, b, "nope"}, graph.CodeBadInput},
	} {
		t.Run(tt.name, func(t *testing.T) {
			tt.client.t = t
			tt.client.expectCode(tt.code, reorder, map[string]any{"shop": tt.shop, "ids": tt.ids})
		})
	}
	seller.t, other.t, anon.t = t, t, t

	var before struct {
		Coffee struct{ UpdatedAt string }
	}
	seller.mustDo(`query($id: ID!) { coffee(id: $id) { updatedAt } }`, map[string]any{"id": a}, &before)
	seller.mustDo(reorder, map[string]any{"shop": shopID, "ids": []string{d, b, a}}, nil)
	if got := names(seller, ""); got != "D,B,A" {
		t.Fatalf("owner order = %q, want D,B,A", got)
	}
	if got := names(anon, ""); got != "B,A" {
		t.Fatalf("public order = %q, want B,A (draft hidden)", got)
	}
	if got := names(anon, "NEWEST"); got != "B,A" {
		t.Fatalf("NEWEST = %q, want B,A", got)
	}
	var after struct {
		Coffee struct{ UpdatedAt string }
	}
	seller.mustDo(`query($id: ID!) { coffee(id: $id) { updatedAt } }`, map[string]any{"id": a}, &after)
	if after.Coffee.UpdatedAt != before.Coffee.UpdatedAt {
		t.Errorf("reordering touched updatedAt: %s → %s", before.Coffee.UpdatedAt, after.Coffee.UpdatedAt)
	}

	// A new coffee and a duplicate both join at the end of the lineup.
	create(seller, "E")
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id, name: "F") { id } }`, map[string]any{"id": d}, nil)
	if got := names(seller, ""); got != "D,B,A,E,F" {
		t.Fatalf("after create + duplicate = %q, want D,B,A,E,F", got)
	}
}
