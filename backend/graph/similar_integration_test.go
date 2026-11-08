package graph_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestSimilarCoffees pins Coffee.similar: other shops only, published only,
// a shared roast alone doesn't count, in-stock first, then score (the same
// brew method adds one but never qualifies a coffee alone), then newest. Requires TEST_DATABASE_URL.
func TestSimilarCoffees(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	sellerA, _ := register(t, url, "sima+"+run+"@example.com")
	sellerB, _ := register(t, url, "simb+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	for i, s := range []*gqlClient{sellerA, sellerB} {
		s.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": fmt.Sprintf("sim%d-%s", i, run), "name": "相似" + run, "description": "", "city": "台北市"}}, nil)
	}
	// Reference rows of its own, so coffees left by other tests (or earlier
	// runs of this one) can't match and crowd this run's out of the limit.
	ctx := context.Background()
	insert := func(q, name string) string {
		var id string
		if err := pool.QueryRow(ctx, q, name+"-"+run).Scan(&id); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
		return id
	}
	const origin = `INSERT INTO origin_countries (name_en, name_zh, region) VALUES ($1, $1, 'Test') RETURNING id`
	const process = `INSERT INTO processing_methods (name_en, name_zh) VALUES ($1, $1) RETURNING id`
	o1, o2 := insert(origin, "sim-o1"), insert(origin, "sim-o2")
	p1, p2 := insert(process, "sim-p1"), insert(process, "sim-p2")
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM coffees WHERE origin_country_id = ANY($1::uuid[]) OR processing_method_id = ANY($2::uuid[])`,
			[]string{o1, o2}, []string{p1, p2})
		_, _ = pool.Exec(ctx, `DELETE FROM origin_countries WHERE id = ANY($1::uuid[])`, []string{o1, o2})
		_, _ = pool.Exec(ctx, `DELETE FROM processing_methods WHERE id = ANY($1::uuid[])`, []string{p1, p2})
	})

	// A unique note keeps seeded coffees out of the flavour-note part of the score.
	note := "note-" + run
	mk := func(s *gqlClient, name, origin, process, roast string, notes []string, stock int, publish bool, brew ...string) string {
		in := map[string]any{
			"name": name, "description": "", "roastLevel": roast, "flavorNotes": notes,
			"originCountryId": origin, "processingMethodId": process,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": stock}},
		}
		if len(brew) > 0 {
			in["brewMethod"] = brew[0]
		}
		var out struct{ CreateCoffee struct{ ID string } }
		s.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`, map[string]any{"in": in}, &out)
		if publish {
			s.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		}
		time.Sleep(5 * time.Millisecond)
		return out.CreateCoffee.ID
	}
	src := mk(sellerA, "src", o1, p1, "LIGHT", []string{note, "Peach-" + run}, 5, true, "FILTER")
	mk(sellerA, "same-shop", o1, p1, "LIGHT", []string{note}, 5, true)
	mk(sellerB, "b1-best", o1, p1, "LIGHT", []string{strings.ToUpper(note)}, 5, true) // 3+2+1+1
	mk(sellerB, "b8-origin-brew", o1, p2, "DARK", nil, 5, true, "FILTER")             // 3 (+1 brew), oldest of the 3s
	mk(sellerB, "b2-origin", o1, p2, "DARK", nil, 5, true)                            // 3
	mk(sellerB, "b3-roast-only", o2, p2, "LIGHT", nil, 5, true)                       // 1: left out
	mk(sellerB, "b4-process-note", o2, p1, "DARK", []string{"peach-" + run}, 5, true) // 2+1, newer than b2
	mk(sellerB, "b5-sold-out", o1, p1, "LIGHT", nil, 0, true)                         // 6, but sold out
	mk(sellerB, "b6-draft", o1, p1, "LIGHT", []string{note}, 5, false)
	mk(sellerB, "b7-roast-brew", o2, p2, "LIGHT", nil, 5, true, "FILTER")       // 1 (+1 brew): still left out
	mk(sellerB, "b9-origin-espresso", o1, p2, "DARK", nil, 5, true, "ESPRESSO") // 3, a different brew method

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
			names = append(names, c.Name)
		}
		return names
	}
	if got, want := strings.Join(similar(12), ","), "b1-best,b8-origin-brew,b9-origin-espresso,b4-process-note,b2-origin,b5-sold-out"; got != want {
		t.Fatalf("similar = %s, want %s", got, want)
	}
	if got, want := strings.Join(similar(2), ","), "b1-best,b8-origin-brew"; got != want {
		t.Fatalf("similar(limit 2) = %s, want %s", got, want)
	}
}
