package graph_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestVariantManagement covers addVariant / updateVariant / deleteVariant and
// the publish ↔ variant-count invariants. Requires TEST_DATABASE_URL.
func TestVariantManagement(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())

	seller, _ := register(t, url, "vseller+"+run+"@example.com")
	buyer, _ := register(t, url, "vbuyer+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "variants-" + run, "name": "規格測試", "description": "", "city": "高雄市"}}, nil)

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	var created struct {
		CreateCoffee struct {
			ID       string
			Variants []struct{ ID string }
		}
	}
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id variants { id } } }`,
		map[string]any{"in": map[string]any{
			"name": "Variant Test", "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 450, "stock": 5}},
		}}, &created)
	coffeeID := created.CreateCoffee.ID
	firstVariant := created.CreateCoffee.Variants[0].ID

	const addQ = `mutation($c: ID!, $in: VariantInput!) { addVariant(coffeeId: $c, input: $in) { id grind weightG priceTwd stock isAvailable } }`
	add := func(grind string, weight, price, stock int) map[string]any {
		return map[string]any{"c": coffeeID, "in": map[string]any{"grind": grind, "weightG": weight, "priceTwd": price, "stock": stock}}
	}

	// ── Authorisation ───────────────────────────────────────────────────────
	anon.expectCode(graph.CodeUnauthenticated, addQ, add("FINE", 250, 500, 1))
	buyer.expectCode(graph.CodeForbidden, addQ, add("FINE", 250, 500, 1))
	buyer.expectCode(graph.CodeForbidden, `mutation($id: ID!) { updateVariant(id: $id, input: {stock: 0}) { id } }`,
		map[string]any{"id": firstVariant})
	buyer.expectCode(graph.CodeForbidden, `mutation($id: ID!) { deleteVariant(id: $id) }`, map[string]any{"id": firstVariant})
	seller.expectCode(graph.CodeNotFound, `mutation($id: ID!) { deleteVariant(id: $id) }`,
		map[string]any{"id": "00000000-0000-0000-0000-000000000000"})
	seller.expectCode(graph.CodeNotFound, `mutation($id: ID!) { deleteVariant(id: $id) }`, map[string]any{"id": "not-a-uuid"})

	// ── addVariant ──────────────────────────────────────────────────────────
	seller.expectCode(graph.CodeConflict, addQ, add("WHOLE_BEAN", 200, 999, 1))
	seller.expectCode(graph.CodeBadInput, addQ, add("FINE", 0, 500, 1))
	var added struct {
		AddVariant struct {
			ID, Grind   string
			WeightG     int
			PriceTwd    int
			Stock       int
			IsAvailable bool
		}
	}
	seller.mustDo(addQ, add("ESPRESSO", 200, 480, 0), &added)
	v2 := added.AddVariant
	if v2.Grind != "ESPRESSO" || v2.PriceTwd != 480 || v2.IsAvailable {
		t.Fatalf("unexpected added variant (stock 0 must not be available): %+v", v2)
	}

	// ── updateVariant ───────────────────────────────────────────────────────
	var upd struct {
		UpdateVariant struct {
			PriceTwd, Stock int
			IsAvailable     bool
		}
	}
	seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: {priceTwd: 500, stock: 8}) { priceTwd stock isAvailable } }`,
		map[string]any{"id": v2.ID}, &upd)
	if upd.UpdateVariant.PriceTwd != 500 || upd.UpdateVariant.Stock != 8 || !upd.UpdateVariant.IsAvailable {
		t.Fatalf("update not applied: %+v", upd)
	}
	seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: {isAvailable: false}) { priceTwd stock isAvailable } }`,
		map[string]any{"id": v2.ID}, &upd)
	if upd.UpdateVariant.IsAvailable || upd.UpdateVariant.PriceTwd != 500 {
		t.Fatalf("partial update clobbered fields: %+v", upd)
	}
	seller.expectCode(graph.CodeBadInput, `mutation($id: ID!) { updateVariant(id: $id, input: {}) { id } }`, map[string]any{"id": v2.ID})
	seller.expectCode(graph.CodeBadInput, `mutation($id: ID!) { updateVariant(id: $id, input: {priceTwd: -1}) { id } }`, map[string]any{"id": v2.ID})

	// ── Published coffees keep at least one variant ─────────────────────────
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)

	// Two concurrent deletes of the only two variants: exactly one may win.
	codes := make([]string, 2)
	var wg sync.WaitGroup
	for i, id := range []string{firstVariant, v2.ID} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i] = rawCode(url, seller.token, `mutation($id: ID!) { deleteVariant(id: $id) }`, map[string]any{"id": id})
		}()
	}
	wg.Wait()
	ok, refused := 0, 0
	for _, c := range codes {
		switch c {
		case "":
			ok++
		case graph.CodeBadInput:
			refused++
		}
	}
	if ok != 1 || refused != 1 {
		t.Fatalf("concurrent deletes: want one success and one BAD_USER_INPUT, got %q", codes)
	}

	var cnt struct {
		Coffee struct{ Variants []struct{ ID string } }
	}
	seller.mustDo(`query($id: ID!) { coffee(id: $id) { variants { id } } }`, map[string]any{"id": coffeeID}, &cnt)
	if len(cnt.Coffee.Variants) != 1 {
		t.Fatalf("published coffee should keep exactly one variant, has %d", len(cnt.Coffee.Variants))
	}
	last := cnt.Coffee.Variants[0].ID

	// Once unpublished, the last variant can go — and publishing is then refused.
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)
	seller.mustDo(`mutation($id: ID!) { deleteVariant(id: $id) }`, map[string]any{"id": last}, nil)
	seller.expectCode(graph.CodeBadInput, `mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID})

	// ── Variant cap ─────────────────────────────────────────────────────────
	for w := 1; w <= 10; w++ {
		seller.mustDo(addQ, add("WHOLE_BEAN", w*100, 300+w, 1), nil)
	}
	seller.expectCode(graph.CodeBadInput, addQ, add("FINE", 100, 300, 1))
}

// rawCode runs one GraphQL request and returns the first error code ("" on
// success). Safe to call from goroutines (it never calls t.Fatal).
func rawCode(url, token, query string, vars map[string]any) string {
	body, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "TRANSPORT: " + err.Error()
	}
	defer res.Body.Close()
	var r gqlResponse
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return "DECODE: " + err.Error()
	}
	if len(r.Errors) == 0 {
		return ""
	}
	code, _ := r.Errors[0].Extensions["code"].(string)
	return code
}
