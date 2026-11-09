package graph_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestFlavorNotesRequired (#181): createCoffee needs at least one non-blank
// flavour note, and updateCoffee rejects a given list that ends up empty. A
// coffee saved before the rule (no notes) still loads, can be edited without
// touching its notes, and can be published. Requires TEST_DATABASE_URL.
func TestFlavorNotesRequired(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "notesseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "notes-" + run, "name": "風味必填", "description": "", "city": "台北市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	base := func(notes any, omit bool) map[string]any {
		in := map[string]any{
			"name": "Notes Test", "description": "", "roastLevel": "LIGHT",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 480, "stock": 2}},
		}
		if !omit {
			in["flavorNotes"] = notes
		}
		return map[string]any{"in": in}
	}
	wantBad := func(label string, r *gqlResponse) {
		t.Helper()
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "flavorNotes" {
			t.Fatalf("%s: got %+v, want BAD_USER_INPUT on flavorNotes", label, r.Errors)
		}
	}
	const create = `mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id flavorNotes } }`
	const update = `mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id name flavorNotes } }`

	wantBad("omitted", seller.do(create, base(nil, true), nil))
	wantBad("null", seller.do(create, base(nil, false), nil))
	wantBad("empty", seller.do(create, base([]string{}, false), nil))
	wantBad("blank", seller.do(create, base([]string{" ", ""}, false), nil))

	var ok struct {
		CreateCoffee struct {
			ID          string
			FlavorNotes []string
		}
	}
	seller.mustDo(create, base([]string{" 柑橘 ", ""}, false), &ok)
	id := ok.CreateCoffee.ID
	if strings.Join(ok.CreateCoffee.FlavorNotes, ",") != "柑橘" {
		t.Fatalf("create: notes %v", ok.CreateCoffee.FlavorNotes)
	}
	wantBad("update to empty", seller.do(update, map[string]any{"id": id, "in": map[string]any{"flavorNotes": []string{}}}, nil))
	wantBad("update to blank", seller.do(update, map[string]any{"id": id, "in": map[string]any{"flavorNotes": []string{"  "}}}, nil))

	// A coffee saved before the rule: no notes in the row.
	if _, err := pool.Exec(context.Background(), `UPDATE coffees SET flavor_notes = '{}' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	var upd struct {
		UpdateCoffee struct {
			Name        string
			FlavorNotes []string
		}
	}
	seller.mustDo(update, map[string]any{"id": id, "in": map[string]any{"name": "Notes Test 2"}}, &upd)
	if upd.UpdateCoffee.Name != "Notes Test 2" || len(upd.UpdateCoffee.FlavorNotes) != 0 {
		t.Fatalf("legacy edit: %+v", upd.UpdateCoffee)
	}
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": id}, nil)
	var got struct {
		Coffee struct{ FlavorNotes []string }
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { flavorNotes } }`, map[string]any{"id": id}, &got)
	if len(got.Coffee.FlavorNotes) != 0 {
		t.Fatalf("legacy coffee: notes %v", got.Coffee.FlavorNotes)
	}
}
