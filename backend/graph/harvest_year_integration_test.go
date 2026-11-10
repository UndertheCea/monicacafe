package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/platform/tz"
)

// TestCoffeeHarvestYear: the harvest year is saved on create, changed /
// cleared on update, validated (no future crops), and copied by
// duplicateCoffee. Requires TEST_DATABASE_URL.
func TestCoffeeHarvestYear(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "harvestseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "harvest-" + run, "name": "產季測試", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type harvest struct {
		ID          string
		HarvestYear *int
	}
	str := func(p *int) string {
		if p == nil {
			return "nil"
		}
		return fmt.Sprint(*p)
	}
	base := func(extra map[string]any) map[string]any {
		in := withEssentials(t, map[string]any{
			"name": "Ethiopia Guji", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 520, "stock": 3}},
		})
		for k, v := range extra {
			in[k] = v
		}
		return map[string]any{"in": in}
	}
	thisYear := tz.ToTaipei(time.Now()).Year()
	wantBad := func(label string, r *gqlResponse, field string) {
		t.Helper()
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != field {
			t.Fatalf("%s: got %+v, want BAD_USER_INPUT on %s", label, r.Errors, field)
		}
	}

	var plain struct{ CreateCoffee harvest }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id harvestYear } }`, base(nil), &plain)
	if got := str(plain.CreateCoffee.HarvestYear); got != "nil" {
		t.Fatalf("plain create: harvestYear %s, want nil", got)
	}

	var created struct{ CreateCoffee harvest }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id harvestYear } }`,
		base(map[string]any{"harvestYear": thisYear - 1}), &created)
	id := created.CreateCoffee.ID
	if got := str(created.CreateCoffee.HarvestYear); got != fmt.Sprint(thisYear-1) {
		t.Fatalf("create: harvestYear %s, want %d", got, thisYear-1)
	}

	wantBad("future crop", seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"harvestYear": thisYear + 1}), nil), "harvestYear")
	wantBad("too old", seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		base(map[string]any{"harvestYear": 1999}), nil), "harvestYear")

	update := func(label string, in map[string]any, want string) {
		t.Helper()
		var out struct{ UpdateCoffee harvest }
		seller.mustDo(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id harvestYear } }`,
			map[string]any{"id": id, "in": in}, &out)
		if got := str(out.UpdateCoffee.HarvestYear); got != want {
			t.Fatalf("%s: harvestYear %s, want %s", label, got, want)
		}
	}
	update("unrelated", map[string]any{"name": "Ethiopia Guji G1"}, fmt.Sprint(thisYear-1))
	update("change", map[string]any{"harvestYear": thisYear}, fmt.Sprint(thisYear))

	var dup struct{ DuplicateCoffee harvest }
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { id harvestYear } }`, map[string]any{"id": id}, &dup)
	if got := str(dup.DuplicateCoffee.HarvestYear); got != fmt.Sprint(thisYear) {
		t.Fatalf("duplicate: harvestYear %s, want %d", got, thisYear)
	}

	wantBad("future update", seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"harvestYear": thisYear + 1}}, nil), "harvestYear")
	wantBad("clear + set", seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": id, "in": map[string]any{"clearHarvestYear": true, "harvestYear": 2024}}, nil), "clearHarvestYear")
	update("clear", map[string]any{"clearHarvestYear": true}, "nil")
	update("clear false is a no-op", map[string]any{"clearHarvestYear": false}, "nil")
}
