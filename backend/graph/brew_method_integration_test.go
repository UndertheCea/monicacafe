package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeeBrewMethod: the brew method is saved on create, changed / cleared
// on update, validated, and copied by duplicateCoffee. Requires
// TEST_DATABASE_URL.
func TestCoffeeBrewMethod(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "brewseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "brew-" + run, "name": "沖煮測試", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type brew struct {
		ID         string
		BrewMethod *string
	}
	str := func(p *string) string {
		if p == nil {
			return "nil"
		}
		return *p
	}
	base := func(extra map[string]any) map[string]any {
		in := withEssentials(t, map[string]any{
			"name": "Kenya Nyeri", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 480, "stock": 3}},
		})
		for k, v := range extra {
			in[k] = v
		}
		return map[string]any{"in": in}
	}

	var plain struct{ CreateCoffee brew }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id brewMethod } }`, base(nil), &plain)
	if got := str(plain.CreateCoffee.BrewMethod); got != "nil" {
		t.Fatalf("plain create: brewMethod %s, want nil", got)
	}

	var created struct{ CreateCoffee brew }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id brewMethod } }`,
		base(map[string]any{"brewMethod": "FILTER"}), &created)
	id := created.CreateCoffee.ID
	if got := str(created.CreateCoffee.BrewMethod); got != "FILTER" {
		t.Fatalf("create: brewMethod %s, want FILTER", got)
	}

	r := seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"brewMethod": "COLD_BREW"}), nil)
	if len(r.Errors) == 0 {
		t.Fatal("create with an unknown brew method should fail")
	}

	update := func(label string, in map[string]any, want string) {
		t.Helper()
		var out struct{ UpdateCoffee brew }
		seller.mustDo(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id brewMethod } }`,
			map[string]any{"id": id, "in": in}, &out)
		if got := str(out.UpdateCoffee.BrewMethod); got != want {
			t.Fatalf("%s: brewMethod %s, want %s", label, got, want)
		}
	}
	update("unrelated", map[string]any{"name": "Kenya Nyeri AA"}, "FILTER")
	update("change", map[string]any{"brewMethod": "OMNI"}, "OMNI")

	var dup struct{ DuplicateCoffee brew }
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { id brewMethod } }`, map[string]any{"id": id}, &dup)
	if got := str(dup.DuplicateCoffee.BrewMethod); got != "OMNI" {
		t.Fatalf("duplicate: brewMethod %s, want OMNI", got)
	}

	r = seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"clearBrewMethod": true, "brewMethod": "FILTER"}}, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "clearBrewMethod" {
		t.Fatalf("clear + set: got %+v, want BAD_USER_INPUT on clearBrewMethod", r.Errors)
	}
	update("clear", map[string]any{"clearBrewMethod": true}, "nil")
	update("clear false is a no-op", map[string]any{"clearBrewMethod": false}, "nil")
}
