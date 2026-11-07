package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestSimilarCoffees pins Coffee.similar: other shops only, published only,
// a shared roast alone doesn't count, in-stock first, then score, then
// newest. Requires TEST_DATABASE_URL.
func TestSimilarCoffees(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	sellerA, _ := register(t, url, "sima+"+run+"@example.com")
	sellerB, _ := register(t, url, "simb+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	for i, s := range []*gqlClient{sellerA, sellerB} {
		s.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": fmt.Sprintf("sim%d-%s", i, run), "name": "相似" + run, "description": "", "city": "台北市"}}, nil)
	}
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	if len(refs.OriginCountries) < 2 || len(refs.ProcessingMethods) < 2 {
		t.Skip("needs at least two origins and processes in the reference data")
	}
	// Other tests create their coffees with the first origin / process; the
	// last ones keep this run's matches from being crowded out of the limit.
	no, np := len(refs.OriginCountries), len(refs.ProcessingMethods)
	o1, o2 := refs.OriginCountries[no-1].ID, refs.OriginCountries[no-2].ID
	p1, p2 := refs.ProcessingMethods[np-1].ID, refs.ProcessingMethods[np-2].ID

	// A unique note keeps seeded coffees out of the flavour-note part of the score.
	note := "note-" + run
	mk := func(s *gqlClient, name, origin, process, roast string, notes []string, stock int, publish bool) string {
		var out struct{ CreateCoffee struct{ ID string } }
		s.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": "", "roastLevel": roast, "flavorNotes": notes,
				"originCountryId": origin, "processingMethodId": process,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": stock}},
			}}, &out)
		if publish {
			s.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
		time.Sleep(5 * time.Millisecond)
		return out.CreateCoffee.ID
	}
	src := mk(sellerA, "src", o1, p1, "LIGHT", []string{note, "Peach-" + run}, 5, true)
	mk(sellerA, "same-shop", o1, p1, "LIGHT", []string{note}, 5, true)
	mk(sellerB, "b1-best", o1, p1, "LIGHT", []string{strings.ToUpper(note)}, 5, true) // 3+2+1+1
	mk(sellerB, "b2-origin", o1, p2, "DARK", nil, 5, true)                            // 3
	mk(sellerB, "b3-roast-only", o2, p2, "LIGHT", nil, 5, true)                       // 1: left out
	mk(sellerB, "b4-process-note", o2, p1, "DARK", []string{"peach-" + run}, 5, true) // 2+1, newer than b2
	mk(sellerB, "b5-sold-out", o1, p1, "LIGHT", nil, 0, true)                         // 6, but sold out
	mk(sellerB, "b6-draft", o1, p1, "LIGHT", []string{note}, 5, false)

	similar := func(limit int) []string {
		var out struct {
			Coffee struct {
				Similar []struct {
					Name string
					Shop struct{ Name string }
				}
			}
		}
		anon.mustDo(`query($id: ID!, $l: Int) { coffee(id: $id) { similar(limit: $l) { name shop { name } } } }`,
			map[string]any{"id": src, "l": limit}, &out)
		var names []string
		for _, c := range out.Coffee.Similar {
			// Seeded coffees can match on origin / process too; keep only this run's.
			if c.Shop.Name == "相似"+run {
				names = append(names, c.Name)
			}
		}
		return names
	}
	if got, want := strings.Join(similar(12), ","), "b1-best,b4-process-note,b2-origin,b5-sold-out"; got != want {
		t.Fatalf("similar = %s, want %s", got, want)
	}
}
