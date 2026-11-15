package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestShopLocationPairAndClear (#295): a location is set as a pair and can be
// removed with clearLocation. Requires TEST_DATABASE_URL.
func TestShopLocationPairAndClear(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "loc+"+run+"@example.com")
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "loc-" + run, "name": "Loc", "description": "", "city": "台南市"}}, &shop)
	id := shop.CreateShop.ID
	const upd = `mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { lat lng } }`
	type res struct {
		UpdateShop struct{ Lat, Lng *float64 }
	}

	var r res
	seller.mustDo(upd, map[string]any{"id": id, "in": map[string]any{"lat": 22.99, "lng": 120.2}}, &r)
	if r.UpdateShop.Lat == nil || *r.UpdateShop.Lat != 22.99 || r.UpdateShop.Lng == nil || *r.UpdateShop.Lng != 120.2 {
		t.Fatalf("after set: %+v", r.UpdateShop)
	}
	seller.expectCode(graph.CodeBadInput, upd, map[string]any{"id": id, "in": map[string]any{"lat": 23.0}})
	seller.expectCode(graph.CodeBadInput, upd, map[string]any{"id": id, "in": map[string]any{"lat": 23.0, "lng": 120.0, "clearLocation": true}})

	// Other fields leave the location alone.
	seller.mustDo(upd, map[string]any{"id": id, "in": map[string]any{"city": "高雄市"}}, &r)
	if r.UpdateShop.Lat == nil {
		t.Fatalf("a city change cleared the location")
	}
	seller.mustDo(upd, map[string]any{"id": id, "in": map[string]any{"clearLocation": true}}, &r)
	if r.UpdateShop.Lat != nil || r.UpdateShop.Lng != nil {
		t.Fatalf("after clear: %+v", r.UpdateShop)
	}
}
