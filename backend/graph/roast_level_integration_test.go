package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeeRoastLevelOptional (#190, owner's answer on #176): a coffee can be
// created without a roast level or as EXTRA_LIGHT; updates change or clear it;
// duplicateCoffee copies it. Requires TEST_DATABASE_URL.
func TestCoffeeRoastLevelOptional(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "roastseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "roast-" + run, "name": "烘焙度測試", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type roast struct {
		ID         string
		RoastLevel *string
	}
	str := func(p *string) string {
		if p == nil {
			return "nil"
		}
		return *p
	}
	base := func(extra map[string]any) map[string]any {
		in := withEssentials(t, map[string]any{
			"name": "Kenya Nyeri", "description": "", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 480, "stock": 3}},
		})
		for k, v := range extra {
			in[k] = v
		}
		return map[string]any{"in": in}
	}

	var plain struct{ CreateCoffee roast }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id roastLevel } }`, base(nil), &plain)
	if got := str(plain.CreateCoffee.RoastLevel); got != "nil" {
		t.Fatalf("create without a roast: roastLevel %s, want nil", got)
	}

	var created struct{ CreateCoffee roast }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id roastLevel } }`,
		base(map[string]any{"roastLevel": "EXTRA_LIGHT"}), &created)
	id := created.CreateCoffee.ID
	if got := str(created.CreateCoffee.RoastLevel); got != "EXTRA_LIGHT" {
		t.Fatalf("create: roastLevel %s, want EXTRA_LIGHT", got)
	}

	r := seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"roastLevel": "BLONDE"}), nil)
	if len(r.Errors) == 0 {
		t.Fatal("create with an unknown roast level should fail")
	}

	update := func(label string, in map[string]any, want string) {
		t.Helper()
		var out struct{ UpdateCoffee roast }
		seller.mustDo(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id roastLevel } }`,
			map[string]any{"id": id, "in": in}, &out)
		if got := str(out.UpdateCoffee.RoastLevel); got != want {
			t.Fatalf("%s: roastLevel %s, want %s", label, got, want)
		}
	}
	update("unrelated", map[string]any{"name": "Kenya Nyeri AA"}, "EXTRA_LIGHT")
	update("change", map[string]any{"roastLevel": "MEDIUM"}, "MEDIUM")

	var dup struct{ DuplicateCoffee roast }
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { id roastLevel } }`, map[string]any{"id": id}, &dup)
	if got := str(dup.DuplicateCoffee.RoastLevel); got != "MEDIUM" {
		t.Fatalf("duplicate: roastLevel %s, want MEDIUM", got)
	}

	r = seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"clearRoastLevel": true, "roastLevel": "DARK"}}, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "clearRoastLevel" {
		t.Fatalf("clear + set: got %+v, want BAD_USER_INPUT on clearRoastLevel", r.Errors)
	}
	update("clear", map[string]any{"clearRoastLevel": true}, "nil")
	update("clear false is a no-op", map[string]any{"clearRoastLevel": false}, "nil")
	update("set again", map[string]any{"roastLevel": "EXTRA_LIGHT"}, "EXTRA_LIGHT")
}
