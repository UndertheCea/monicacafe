package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeeCupProfile: acidity / sweetness / body are saved on create,
// replaced as a group / cleared on update, validated (1–5), and copied by
// duplicateCoffee. Requires TEST_DATABASE_URL.
func TestCoffeeCupProfile(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "cupseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "cup-" + run, "name": "風味測試", "description": "", "city": "台中市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type cup struct {
		ID                       string
		Acidity, Sweetness, Body *int
	}
	str := func(c cup) string {
		s := ""
		for _, p := range []*int{c.Acidity, c.Sweetness, c.Body} {
			if p == nil {
				s += "-"
			} else {
				s += fmt.Sprint(*p)
			}
		}
		return s
	}
	base := func(extra map[string]any) map[string]any {
		in := map[string]any{
			"name": "Kenya Nyeri", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 560, "stock": 3}},
		}
		for k, v := range extra {
			in[k] = v
		}
		return map[string]any{"in": in}
	}
	wantBad := func(label string, r *gqlResponse, field string) {
		t.Helper()
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != field {
			t.Fatalf("%s: got %+v, want BAD_USER_INPUT on %s", label, r.Errors, field)
		}
	}
	const fields = `id acidity sweetness body`

	var plain struct{ CreateCoffee cup }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { `+fields+` } }`, base(nil), &plain)
	if got := str(plain.CreateCoffee); got != "---" {
		t.Fatalf("plain create: %s, want ---", got)
	}

	var created struct{ CreateCoffee cup }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { `+fields+` } }`,
		base(map[string]any{"cupProfile": map[string]any{"acidity": 5, "sweetness": 3, "body": 2}}), &created)
	id := created.CreateCoffee.ID
	if got := str(created.CreateCoffee); got != "532" {
		t.Fatalf("create: %s, want 532", got)
	}

	wantBad("acidity 6", seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"cupProfile": map[string]any{"acidity": 6}}), nil), "acidity")
	wantBad("empty profile", seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"cupProfile": map[string]any{}}), nil), "cupProfile")

	update := func(label string, in map[string]any, want string) {
		t.Helper()
		var out struct{ UpdateCoffee cup }
		seller.mustDo(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { `+fields+` } }`,
			map[string]any{"id": id, "in": in}, &out)
		if got := str(out.UpdateCoffee); got != want {
			t.Fatalf("%s: %s, want %s", label, got, want)
		}
	}
	update("unrelated", map[string]any{"name": "Kenya Nyeri AA"}, "532")
	update("replace as a group", map[string]any{"cupProfile": map[string]any{"acidity": 4, "body": 3}}, "4-3")

	var dup struct{ DuplicateCoffee cup }
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { `+fields+` } }`, map[string]any{"id": id}, &dup)
	if got := str(dup.DuplicateCoffee); got != "4-3" {
		t.Fatalf("duplicate: %s, want 4-3", got)
	}

	wantBad("body 0", seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"cupProfile": map[string]any{"body": 0}}}, nil), "body")
	wantBad("clear + set", seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"clearCupProfile": true, "cupProfile": map[string]any{"acidity": 1}}}, nil), "clearCupProfile")
	update("clear", map[string]any{"clearCupProfile": true}, "---")
	update("clear false is a no-op", map[string]any{"clearCupProfile": false}, "---")
}
