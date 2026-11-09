package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestReferenceCoffeeCount: coffeeCount on origin countries, varieties and
// processing methods counts published coffees only, the same for every viewer.
// The shared test DB holds other tests' coffees, so the test compares counts
// before and after. Requires TEST_DATABASE_URL.
func TestReferenceCoffeeCount(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "refcount+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "refcount-" + run, "name": "計數", "description": "", "city": "台南市"}}, nil)

	type ref struct {
		ID          string
		CoffeeCount int
	}
	type refs struct {
		OriginCountries   []ref
		CoffeeVarieties   []ref
		ProcessingMethods []ref
	}
	const q = `{ originCountries { id coffeeCount } coffeeVarieties { id coffeeCount } processingMethods { id coffeeCount } }`
	counts := func(c *gqlClient) (origin, variety, method map[string]int) {
		var out refs
		c.mustDo(q, nil, &out)
		m := func(rs []ref) map[string]int {
			o := make(map[string]int, len(rs))
			for _, r := range rs {
				if r.CoffeeCount < 0 {
					t.Fatalf("negative coffeeCount for %s", r.ID)
				}
				o[r.ID] = r.CoffeeCount
			}
			return o
		}
		return m(out.OriginCountries), m(out.CoffeeVarieties), m(out.ProcessingMethods)
	}

	var all refs
	anon.mustDo(q, nil, &all)
	// The last of each list: the fewest other tests use it.
	origin := all.OriginCountries[len(all.OriginCountries)-1].ID
	variety := all.CoffeeVarieties[len(all.CoffeeVarieties)-1].ID
	method := all.ProcessingMethods[len(all.ProcessingMethods)-1].ID
	o0, v0, m0 := counts(anon)

	// Two published coffees and one draft; one published coffee has no variety.
	for i, c := range []struct {
		publish    bool
		hasVariety bool
	}{{true, true}, {true, false}, {false, true}} {
		in := map[string]any{
			"name": fmt.Sprintf("Ref %d", i), "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": origin, "processingMethodId": method,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}
		if c.hasVariety {
			in["varietyId"] = variety
		}
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`, map[string]any{"in": in}, &out)
		if c.publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
	}

	for _, tc := range []struct {
		name string
		c    *gqlClient
	}{{"anonymous", anon}, {"owner", seller}} {
		t.Run(tc.name, func(t *testing.T) {
			tc.c.t = t
			o, v, m := counts(tc.c)
			for _, d := range []struct {
				what        string
				got, before int
				want        int
			}{
				{"origin", o[origin], o0[origin], 2},
				{"variety", v[variety], v0[variety], 1}, // the draft doesn't count
				{"process", m[method], m0[method], 2},
			} {
				if d.got-d.before != d.want {
					t.Errorf("%s coffeeCount went %d → %d, want +%d", d.what, d.before, d.got, d.want)
				}
			}
		})
	}
}
