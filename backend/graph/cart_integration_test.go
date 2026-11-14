package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestCart covers cart / addToCart / updateCartItem / removeFromCart (#21):
// signed-out refusal, drafts and unknown options, stock and 20-bag caps,
// adding to an existing line, the price snapshot, lines going unavailable
// when the seller marks an option off sale, and one buyer never touching
// another's lines. Requires TEST_DATABASE_URL.
func TestCart(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "cartseller+"+run+"@example.com")
	buyer, _ := register(t, url, "cartbuyer+"+run+"@example.com")
	other, _ := register(t, url, "cartother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "cart-" + run, "name": "購物車測試", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	type variant struct {
		ID    string
		Stock int
	}
	newCoffee := func(name string, publish bool, stock int) (string, string) {
		var co struct {
			CreateCoffee struct {
				ID       string
				Variants []variant
			}
		}
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id variants { id stock } } }`,
			map[string]any{"in": withEssentials(t, map[string]any{
				"name": name, "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 450, "stock": stock}},
			})}, &co)
		if publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": co.CreateCoffee.ID}, nil)
		}
		return co.CreateCoffee.ID, co.CreateCoffee.Variants[0].ID
	}
	_, few := newCoffee("Few", true, 3)
	_, many := newCoffee("Many", true, 100)
	_, draft := newCoffee("Draft", false, 5)

	const cartFields = `items { id quantity priceTwd addedPriceTwd priceChanged available lineTotalTwd variant { id } coffee { name } } subtotalTwd itemCount`
	type cart struct {
		Items []struct {
			ID            string
			Quantity      int
			PriceTwd      int
			AddedPriceTwd int
			PriceChanged  bool
			Available     bool
			LineTotalTwd  int
			Variant       struct{ ID string }
			Coffee        *struct{ Name string }
		}
		SubtotalTwd int
		ItemCount   int
	}
	add := `mutation($v: ID!, $q: Int!) { addToCart(variantId: $v, quantity: $q) { ` + cartFields + ` } }`
	update := `mutation($id: ID!, $q: Int!) { updateCartItem(id: $id, quantity: $q) { ` + cartFields + ` } }`
	remove := `mutation($id: ID!) { removeFromCart(id: $id) { ` + cartFields + ` } }`
	get := `{ cart { ` + cartFields + ` } }`

	anon.expectCode(graph.CodeUnauthenticated, get, nil)
	anon.expectCode(graph.CodeUnauthenticated, add, map[string]any{"v": few, "q": 1})
	buyer.expectCode(graph.CodeNotFound, add, map[string]any{"v": draft, "q": 1})
	buyer.expectCode(graph.CodeNotFound, add, map[string]any{"v": "00000000-0000-0000-0000-000000000000", "q": 1})
	buyer.expectCode(graph.CodeBadInput, add, map[string]any{"v": few, "q": 4})   // only 3 left
	buyer.expectCode(graph.CodeBadInput, add, map[string]any{"v": many, "q": 21}) // 20-bag cap
	buyer.expectCode(graph.CodeBadInput, add, map[string]any{"v": few, "q": 0})

	var empty struct{ Cart cart }
	buyer.mustDo(get, nil, &empty)
	if len(empty.Cart.Items) != 0 || empty.Cart.SubtotalTwd != 0 {
		t.Fatalf("new cart: %+v", empty.Cart)
	}

	var a struct{ AddToCart cart }
	buyer.mustDo(add, map[string]any{"v": few, "q": 2}, &a)
	buyer.mustDo(add, map[string]any{"v": few, "q": 1}, &a) // adds to the same line
	buyer.expectCode(graph.CodeBadInput, add, map[string]any{"v": few, "q": 1})
	buyer.mustDo(add, map[string]any{"v": many, "q": 2}, &a)
	c := a.AddToCart
	if len(c.Items) != 2 || c.Items[0].Quantity != 3 || c.Items[0].Coffee == nil || c.Items[0].Coffee.Name != "Few" ||
		c.SubtotalTwd != 5*450 || c.ItemCount != 5 || !c.Items[1].Available {
		t.Fatalf("after adds: %+v", c)
	}
	fewLine, manyLine := c.Items[0].ID, c.Items[1].ID

	// The seller raises a price: the line keeps its snapshot and says so.
	seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: { priceTwd: 500 }) { id } }`, map[string]any{"id": many}, nil)
	var g struct{ Cart cart }
	buyer.mustDo(get, nil, &g)
	if l := g.Cart.Items[1]; !l.PriceChanged || l.AddedPriceTwd != 450 || l.PriceTwd != 500 || l.LineTotalTwd != 1000 {
		t.Fatalf("after price change: %+v", l)
	}
	// Changing the quantity takes today's price as the new snapshot.
	var u struct{ UpdateCartItem cart }
	buyer.mustDo(update, map[string]any{"id": manyLine, "q": 4}, &u)
	if l := u.UpdateCartItem.Items[1]; l.PriceChanged || l.Quantity != 4 || l.AddedPriceTwd != 500 {
		t.Fatalf("after update: %+v", l)
	}
	buyer.expectCode(graph.CodeBadInput, update, map[string]any{"id": fewLine, "q": 4})
	other.expectCode(graph.CodeNotFound, update, map[string]any{"id": fewLine, "q": 1})
	other.expectCode(graph.CodeNotFound, remove, map[string]any{"id": fewLine})

	// Off sale: the line stays, unavailable, out of the subtotal; it can be lowered.
	seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: { isAvailable: false }) { id } }`, map[string]any{"id": few}, nil)
	buyer.mustDo(get, nil, &g)
	if l := g.Cart.Items[0]; l.Available || g.Cart.SubtotalTwd != 4*500 || g.Cart.ItemCount != 4 {
		t.Fatalf("after off sale: %+v", g.Cart)
	}
	buyer.mustDo(update, map[string]any{"id": fewLine, "q": 1}, &u)
	buyer.expectCode(graph.CodeBadInput, update, map[string]any{"id": fewLine, "q": 2})

	var r struct{ RemoveFromCart cart }
	buyer.mustDo(remove, map[string]any{"id": fewLine}, &r)
	if len(r.RemoveFromCart.Items) != 1 || r.RemoveFromCart.Items[0].ID != manyLine {
		t.Fatalf("after remove: %+v", r.RemoveFromCart)
	}
	buyer.expectCode(graph.CodeNotFound, remove, map[string]any{"id": fewLine})

	// The other buyer's cart is their own.
	var o struct{ Cart cart }
	other.mustDo(get, nil, &o)
	if len(o.Cart.Items) != 0 {
		t.Fatalf("other buyer sees %+v", o.Cart)
	}
}
