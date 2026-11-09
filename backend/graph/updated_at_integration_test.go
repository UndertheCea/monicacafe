package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestUpdatedAt checks Shop.updatedAt / Coffee.updatedAt, including that a
// coffee's value follows its variants (migration 006) and that deleting a
// draft still works with the variant trigger in place. Requires TEST_DATABASE_URL.
func TestUpdatedAt(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "upd+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	var shop struct {
		CreateShop struct {
			ID                   string
			CreatedAt, UpdatedAt time.Time
		}
	}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id createdAt updatedAt } }`,
		map[string]any{"in": map[string]any{"slug": "upd-" + run, "name": "更新時間", "description": "", "city": "台中市"}}, &shop)
	if shop.CreateShop.UpdatedAt.Before(shop.CreateShop.CreatedAt) {
		t.Fatalf("new shop: updatedAt %v before createdAt %v", shop.CreateShop.UpdatedAt, shop.CreateShop.CreatedAt)
	}
	time.Sleep(20 * time.Millisecond)
	var upShop struct{ UpdateShop struct{ UpdatedAt time.Time } }
	seller.mustDo(`mutation($id: ID!) { updateShop(id: $id, input: {description: "新"}) { updatedAt } }`,
		map[string]any{"id": shop.CreateShop.ID}, &upShop)
	if !upShop.UpdateShop.UpdatedAt.After(shop.CreateShop.UpdatedAt) {
		t.Fatalf("updateShop didn't move updatedAt: %v → %v", shop.CreateShop.UpdatedAt, upShop.UpdateShop.UpdatedAt)
	}

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var created struct {
		CreateCoffee struct {
			ID        string
			UpdatedAt time.Time
			Variants  []struct{ ID string }
		}
	}
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id updatedAt variants { id } } }`,
		map[string]any{"in": map[string]any{
			"name": "Updated At", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}}, &created)
	coffeeID := created.CreateCoffee.ID
	variantID := created.CreateCoffee.Variants[0].ID

	coffeeUpdatedAt := func() time.Time {
		var out struct{ Coffee struct{ UpdatedAt time.Time } }
		seller.mustDo(`query($id: ID!) { coffee(id: $id) { updatedAt } }`, map[string]any{"id": coffeeID}, &out)
		return out.Coffee.UpdatedAt
	}

	steps := []struct {
		name  string
		query string
		vars  map[string]any
	}{
		{"updateCoffee", `mutation($id: ID!) { updateCoffee(id: $id, input: {description: "x"}) { id } }`, map[string]any{"id": coffeeID}},
		{"addVariant", `mutation($id: ID!) { addVariant(coffeeId: $id, input: {grind: FINE, weightG: 200, priceTwd: 420, stock: 1}) { id } }`, map[string]any{"id": coffeeID}},
		{"updateVariant", `mutation($id: ID!) { updateVariant(id: $id, input: {priceTwd: 380}) { id } }`, map[string]any{"id": variantID}},
		{"deleteVariant", `mutation($id: ID!) { deleteVariant(id: $id) }`, map[string]any{"id": variantID}},
	}
	prev := coffeeUpdatedAt()
	for _, s := range steps {
		time.Sleep(20 * time.Millisecond)
		seller.mustDo(s.query, s.vars, nil)
		now := coffeeUpdatedAt()
		if !now.After(prev) {
			t.Fatalf("%s didn't move Coffee.updatedAt: %v → %v", s.name, prev, now)
		}
		prev = now
	}

	// Deleting the draft cascades to its variants; the trigger must not get in the way.
	var del struct{ DeleteCoffee bool }
	seller.mustDo(`mutation($id: ID!) { deleteCoffee(id: $id) }`, map[string]any{"id": coffeeID}, &del)
	if !del.DeleteCoffee {
		t.Fatal("deleteCoffee returned false")
	}
}
