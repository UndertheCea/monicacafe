package graph_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestFreeOptionsNotBuyable (#358): an option must cost at least NT$1 (the
// cart's minimum, #292 2a), and an NT$0 row stored before that rule is not
// "in stock" anywhere in the catalogue: not under inStock, not first by
// price, not matched by maxPriceTwd: 0. Requires TEST_DATABASE_URL.
func TestFreeOptionsNotBuyable(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	seller, _ := register(t, url, "freeopt+"+run+"@example.com")
	shopName := "FreeOpt" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "freeopt-" + run, "name": shopName, "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	create := func(name string, price int) (string, string) {
		in := withEssentials(t, map[string]any{
			"name": name, "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": price, "stock": 3}},
		})
		var out struct{ CreateCoffee struct{ ID string } }
		r := seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`, map[string]any{"in": in}, &out)
		if len(r.Errors) > 0 {
			code, _ := r.Errors[0].Extensions["code"].(string)
			return "", code
		}
		return out.CreateCoffee.ID, ""
	}

	// New options can't be free.
	if _, code := create("Zero", 0); code != "BAD_USER_INPUT" {
		t.Fatalf("createCoffee with NT$0: want BAD_USER_INPUT, got %q", code)
	}

	// A legacy NT$0 row (written before #358) and a paid coffee.
	freeID, code := create("Legacy", 1)
	if code != "" {
		t.Fatal(code)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := pool.Exec(ctx, `UPDATE variants SET price_twd = 0 WHERE coffee_id = $1`, freeID); err != nil {
		t.Fatal(err)
	}
	paidID, code := create("Paid", 300)
	if code != "" {
		t.Fatal(code)
	}
	for _, id := range []string{freeID, paidID} {
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": id}, nil)
	}

	list := func(f map[string]any, sort string) string {
		f["search"] = shopName
		var out struct {
			Coffees struct{ Nodes []struct{ Name string } }
		}
		anon.mustDo(`query($f: CoffeeFilter, $s: CoffeeSort) { coffees(filter: $f, sort: $s, limit: 10) { nodes { name } } }`,
			map[string]any{"f": f, "s": sort}, &out)
		var names []string
		for _, n := range out.Coffees.Nodes {
			names = append(names, n.Name)
		}
		return strings.Join(names, ",")
	}
	for _, tt := range []struct {
		name, sort, want string
		f                map[string]any
	}{
		{"in stock leaves the free one out", "NEWEST", "Paid", map[string]any{"inStock": true}},
		{"sold out lists the free one", "NEWEST", "Legacy", map[string]any{"inStock": false}},
		{"cheapest first puts the free one last", "PRICE_ASC", "Paid,Legacy", map[string]any{}},
		{"max price 0 matches nothing", "NEWEST", "", map[string]any{"maxPriceTwd": 0}},
	} {
		if got := list(tt.f, tt.sort); got != tt.want {
			t.Errorf("%s: got %q, want %q", tt.name, got, tt.want)
		}
	}
}
