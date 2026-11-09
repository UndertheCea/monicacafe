package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestDeleteCoffee: only the owner may delete, only drafts can be deleted, and
// variants and comments go with the coffee. Requires TEST_DATABASE_URL.
func TestDeleteCoffee(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())

	seller, _ := register(t, url, "dseller+"+run+"@example.com")
	other, _ := register(t, url, "dother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	for i, c := range []*gqlClient{seller, other} {
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": fmt.Sprintf("delete-%d-%s", i, run), "name": "刪除測試", "description": "", "city": "台中市"}}, nil)
	}

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	create := func() string {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": "Delete Test", "description": "", "roastLevel": "DARK", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		return out.CreateCoffee.ID
	}
	const del = `mutation($id: ID!) { deleteCoffee(id: $id) }`
	draft := create()

	tests := []struct {
		name   string
		client *gqlClient
		id     string
		code   string
	}{
		{"anonymous", anon, draft, graph.CodeUnauthenticated},
		{"another seller", other, draft, graph.CodeForbidden},
		{"malformed id", seller, "not-a-uuid", graph.CodeNotFound},
		{"unknown id", seller, "00000000-0000-0000-0000-000000000000", graph.CodeNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.client.t = t
			tt.client.expectCode(tt.code, del, map[string]any{"id": tt.id})
		})
	}
	seller.t, other.t, anon.t = t, t, t

	// Published coffees must be unpublished first.
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": draft}, nil)
	other.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": draft, "body": "好喝"}}, nil)
	seller.expectCode(graph.CodeConflict, del, map[string]any{"id": draft})
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": draft}, nil)

	var ok struct{ DeleteCoffee bool }
	seller.mustDo(del, map[string]any{"id": draft}, &ok)
	if !ok.DeleteCoffee {
		t.Fatal("deleteCoffee returned false")
	}
	var left int
	if err := pool.QueryRow(context.Background(), `
		SELECT (SELECT count(*) FROM coffees WHERE id = $1) + (SELECT count(*) FROM variants WHERE coffee_id = $1)
		     + (SELECT count(*) FROM comments WHERE coffee_id = $1)`, draft).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Fatalf("%d coffee / variant / comment rows left after delete", left)
	}
	seller.expectCode(graph.CodeNotFound, del, map[string]any{"id": draft})
}
