package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCoffeeProvenance: producer, region and altitude are saved on create,
// changed / cleared on update, validated, and copied by duplicateCoffee.
// Requires TEST_DATABASE_URL.
func TestCoffeeProvenance(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "provseller+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "prov-" + run, "name": "產地測試", "description": "", "city": "台中市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	type prov struct {
		ID, Producer, Region       string
		AltitudeMinM, AltitudeMaxM *int
	}
	const fields = `id producer region altitudeMinM altitudeMaxM`
	base := func(extra map[string]any) map[string]any {
		in := map[string]any{
			"name": "Guatemala Huehuetenango", "description": "", "roastLevel": "LIGHT",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 520, "stock": 3}},
		}
		for k, v := range extra {
			in[k] = v
		}
		return map[string]any{"in": in}
	}
	alt := func(p *int) string {
		if p == nil {
			return "nil"
		}
		return fmt.Sprint(*p)
	}
	check := func(label string, got prov, producer, region, minM, maxM string) {
		t.Helper()
		if got.Producer != producer || got.Region != region || alt(got.AltitudeMinM) != minM || alt(got.AltitudeMaxM) != maxM {
			t.Fatalf("%s: got %q %q %s–%s, want %q %q %s–%s", label, got.Producer, got.Region,
				alt(got.AltitudeMinM), alt(got.AltitudeMaxM), producer, region, minM, maxM)
		}
	}

	// Not given: blank text and null altitude.
	var plain struct{ CreateCoffee prov }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { `+fields+` } }`, base(nil), &plain)
	check("plain create", plain.CreateCoffee, "", "", "nil", "nil")

	var created struct{ CreateCoffee prov }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { `+fields+` } }`,
		base(map[string]any{"producer": " Finca El Injerto ", "region": "Huehuetenango", "altitudeMinM": 1500, "altitudeMaxM": 1900}), &created)
	id := created.CreateCoffee.ID
	check("create", created.CreateCoffee, "Finca El Injerto", "Huehuetenango", "1500", "1900")

	for _, tt := range []struct {
		name  string
		extra map[string]any
		field string
	}{
		{"max below min", map[string]any{"altitudeMinM": 2000, "altitudeMaxM": 1000}, "altitudeMaxM"},
		{"max alone", map[string]any{"altitudeMaxM": 1000}, "altitudeMinM"},
		{"too high", map[string]any{"altitudeMinM": 9000}, "altitudeMinM"},
		{"long producer", map[string]any{"producer": strings.Repeat("x", 101)}, "producer"},
	} {
		r := seller.do(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`, base(tt.extra), nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != tt.field {
			t.Fatalf("create %s: got %+v, want BAD_USER_INPUT on %s", tt.name, r.Errors, tt.field)
		}
	}

	update := func(label string, in map[string]any, producer, region, minM, maxM string) {
		t.Helper()
		var out struct{ UpdateCoffee prov }
		seller.mustDo(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { `+fields+` } }`,
			map[string]any{"id": id, "in": in}, &out)
		check(label, out.UpdateCoffee, producer, region, minM, maxM)
	}
	// Unrelated update leaves provenance alone.
	update("name only", map[string]any{"name": "Huehue"}, "Finca El Injerto", "Huehuetenango", "1500", "1900")
	// Min alone replaces both ends with a single height.
	update("single height", map[string]any{"altitudeMinM": 1700}, "Finca El Injerto", "Huehuetenango", "1700", "nil")
	update("range", map[string]any{"altitudeMinM": 1600, "altitudeMaxM": 1800, "region": "La Libertad"},
		"Finca El Injerto", "La Libertad", "1600", "1800")

	// Duplicate copies provenance.
	var dup struct{ DuplicateCoffee prov }
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { `+fields+` } }`, map[string]any{"id": id}, &dup)
	check("duplicate", dup.DuplicateCoffee, "Finca El Injerto", "La Libertad", "1600", "1800")

	for _, tt := range []struct {
		name  string
		in    map[string]any
		field string
	}{
		{"clear with value", map[string]any{"clearAltitude": true, "altitudeMinM": 100}, "clearAltitude"},
		{"max alone", map[string]any{"altitudeMaxM": 1000}, "altitudeMinM"},
		{"max below min", map[string]any{"altitudeMinM": 1000, "altitudeMaxM": 900}, "altitudeMaxM"},
		{"long region", map[string]any{"region": strings.Repeat("區", 101)}, "region"},
	} {
		r := seller.do(`mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
			map[string]any{"id": id, "in": tt.in}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != tt.field {
			t.Fatalf("update %s: got %+v, want BAD_USER_INPUT on %s", tt.name, r.Errors, tt.field)
		}
	}

	update("clear", map[string]any{"producer": "", "region": "  ", "clearAltitude": true}, "", "", "nil", "nil")
}
