package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestShopCoffeeCount: Shop.coffeeCount counts published coffees only, for
// strangers and for the owner alike. Requires TEST_DATABASE_URL.
func TestShopCoffeeCount(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "countshop+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	slug := "count-shop-" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "計數", "description": "", "city": "台中市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	// Two published coffees and one draft.
	for i, publish := range []bool{true, true, false} {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": fmt.Sprintf("C%d", i), "description": "", "roastLevel": "LIGHT",
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		if publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
	}

	const q = `query($slug: String!) { shop(slug: $slug) { coffeeCount coffees { total } } }`
	for _, tc := range []struct {
		name      string
		c         *gqlClient
		wantTotal int // coffees.total includes drafts for the owner
	}{{"anonymous", anon, 2}, {"owner", seller, 3}} {
		t.Run(tc.name, func(t *testing.T) {
			tc.c.t = t
			var out struct {
				Shop struct {
					CoffeeCount int
					Coffees     struct{ Total int }
				}
			}
			tc.c.mustDo(q, map[string]any{"slug": slug}, &out)
			if out.Shop.CoffeeCount != 2 || out.Shop.Coffees.Total != tc.wantTotal {
				t.Fatalf("coffeeCount %d (want 2), coffees.total %d (want %d)", out.Shop.CoffeeCount, out.Shop.Coffees.Total, tc.wantTotal)
			}
		})
	}

	// Batched across a list: every shop resolves (no error, never negative).
	var list struct {
		Shops struct {
			Nodes []struct {
				Slug        string
				CoffeeCount int
			}
		}
	}
	anon.mustDo(`{ shops(limit: 50) { nodes { slug coffeeCount } } }`, nil, &list)
	found := false
	for _, n := range list.Shops.Nodes {
		if n.CoffeeCount < 0 {
			t.Errorf("%s: negative count", n.Slug)
		}
		if n.Slug == slug {
			found = true
			if n.CoffeeCount != 2 {
				t.Errorf("listed coffeeCount %d, want 2", n.CoffeeCount)
			}
		}
	}
	if !found {
		t.Errorf("new shop not in the first 50 shops")
	}

	// Every sort resolves through the API; MOST_COFFEES is non-increasing.
	for _, sort := range []string{"NEWEST", "NAME", "MOST_COFFEES"} {
		var out struct {
			Shops struct {
				Total int
				Nodes []struct{ CoffeeCount int }
			}
		}
		anon.mustDo(`query($s: ShopSort) { shops(sort: $s, limit: 20) { total nodes { coffeeCount } } }`,
			map[string]any{"s": sort}, &out)
		if out.Shops.Total == 0 || len(out.Shops.Nodes) == 0 {
			t.Fatalf("%s: no shops", sort)
		}
		if sort == "MOST_COFFEES" {
			for i := 1; i < len(out.Shops.Nodes); i++ {
				if out.Shops.Nodes[i].CoffeeCount > out.Shops.Nodes[i-1].CoffeeCount {
					t.Fatalf("MOST_COFFEES out of order at %d: %+v", i, out.Shops.Nodes)
				}
			}
		}
	}
}
