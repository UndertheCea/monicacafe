package graph_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// TestMyDataExport (#270): the export holds the caller's own account, sessions,
// comments, saves, follows, reports and shop, and nothing secret or belonging
// to someone else; signed-out callers are refused and it is rate limited.
// Requires TEST_DATABASE_URL.
func TestMyDataExport(t *testing.T) {
	url, pool := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{ExportUser: ratelimit.New(ratelimit.Rule{Burst: 3, Per: time.Hour})}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "exs+"+run+"@example.com")
	buyer, _ := register(t, url, "exb+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "ex-" + run, "name": "匯出烘焙", "description": "", "city": "台中市"}}, &shop)
	publishTestCoffee(t, pool, shop.CreateShop.ID)
	var coffeeID string
	if err := pool.QueryRow(t.Context(), `SELECT id FROM coffees WHERE shop_id = $1`, shop.CreateShop.ID).Scan(&coffeeID); err != nil {
		t.Fatal(err)
	}
	buyer.mustDo(`mutation($id: ID!) { saveCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)
	buyer.mustDo(`mutation($id: ID!) { followShop(id: $id) { id } }`, map[string]any{"id": shop.CreateShop.ID}, nil)
	var variantID string
	if err := pool.QueryRow(t.Context(), `INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock)
		VALUES ($1, 'WHOLE_BEAN', 200, 450, 5) RETURNING id`, coffeeID).Scan(&variantID); err != nil {
		t.Fatal(err)
	}
	buyer.mustDo(`mutation($v: ID!) { addToCart(variantId: $v) { itemCount } }`, map[string]any{"v": variantID}, nil)
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "買家留言 " + run}}, nil)
	seller.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "店家回覆 " + run}}, nil)

	const q = `{ myDataExport }`
	anon.expectCode(graph.CodeUnauthenticated, q, nil)

	export := func(c *gqlClient) (map[string]any, string) {
		t.Helper()
		var r struct{ MyDataExport string }
		c.mustDo(q, nil, &r)
		var doc map[string]any
		if err := json.Unmarshal([]byte(r.MyDataExport), &doc); err != nil {
			t.Fatalf("export is not JSON: %v\n%s", err, r.MyDataExport)
		}
		return doc, r.MyDataExport
	}

	doc, raw := export(buyer)
	acct := doc["account"].(map[string]any)
	if acct["email"] != "exb+"+run+"@example.com" || acct["role"] != "BUYER" {
		t.Errorf("account: %v", acct)
	}
	if n := len(doc["sessions"].([]any)); n != 1 {
		t.Errorf("sessions: %d, want 1 (the registration's)", n)
	}
	comments := doc["comments"].([]any)
	if len(comments) != 1 || comments[0].(map[string]any)["body"] != "買家留言 "+run {
		t.Errorf("comments: %v", comments)
	}
	if saves := doc["savedCoffees"].([]any); len(saves) != 1 || saves[0].(map[string]any)["coffeeId"] != coffeeID {
		t.Errorf("savedCoffees: %v", saves)
	}
	if cart := doc["cart"].([]any); len(cart) != 1 || cart[0].(map[string]any)["coffeeId"] != coffeeID {
		t.Errorf("cart: %v", cart)
	}
	if follows := doc["followedShops"].([]any); len(follows) != 1 || follows[0].(map[string]any)["shopSlug"] != "ex-"+run {
		t.Errorf("followedShops: %v", follows)
	}
	if doc["shop"] != nil {
		t.Errorf("a buyer's export has a shop: %v", doc["shop"])
	}
	for _, secret := range []string{"password", "hash", "token", "店家回覆", "exs+"} {
		if strings.Contains(strings.ToLower(raw), strings.ToLower(secret)) {
			t.Errorf("buyer export contains %q:\n%s", secret, raw)
		}
	}

	doc, raw = export(seller)
	sh, ok := doc["shop"].(map[string]any)
	if !ok || sh["slug"] != "ex-"+run || sh["city"] != "台中市" {
		t.Fatalf("seller shop: %v", doc["shop"])
	}
	if cs := sh["coffees"].([]any); len(cs) != 1 || cs[0].(map[string]any)["published"] != true {
		t.Errorf("seller coffees: %v", sh["coffees"])
	}
	// Ordinary coffees and options have null archive / takedown stamps (#536).
	for _, c := range sh["coffees"].([]any) {
		cm := c.(map[string]any)
		for _, k := range []string{"archivedAt", "takenDownAt"} {
			if v, present := cm[k]; !present || v != nil {
				t.Errorf("coffee %s: %v (present %v), want null", k, v, present)
			}
		}
		for _, o := range cm["options"].([]any) {
			if v, present := o.(map[string]any)["archivedAt"]; !present || v != nil {
				t.Errorf("option archivedAt: %v (present %v), want null", v, present)
			}
		}
	}
	if strings.Contains(raw, "買家留言") || strings.Contains(raw, "exb+") {
		t.Errorf("seller export contains the buyer's data:\n%s", raw)
	}

	if comments[0].(map[string]any)["coffeeName"] == nil {
		t.Errorf("a public coffee's name is missing: %v", comments)
	}

	// The coffee goes back to draft and the shop is suspended: the buyer can't
	// see them any more, so the export keeps the ids but not the names (#295).
	// The seller still sees their own coffee's name.
	if _, err := pool.Exec(t.Context(), `UPDATE coffees SET is_published = false WHERE id = $1`, coffeeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), `UPDATE shops SET suspended_at = now() WHERE id = $1`, shop.CreateShop.ID); err != nil {
		t.Fatal(err)
	}
	doc, _ = export(buyer)
	for _, k := range []string{"comments", "savedCoffees", "cart"} {
		rows := doc[k].([]any)
		if len(rows) != 1 || rows[0].(map[string]any)["coffeeId"] != coffeeID || rows[0].(map[string]any)["coffeeName"] != nil {
			t.Errorf("%s after unpublish: %v", k, rows)
		}
	}
	if f := doc["followedShops"].([]any); len(f) != 1 || f[0].(map[string]any)["shopName"] != nil {
		t.Errorf("followedShops after suspension: %v", f)
	}
	// An archived option and a taken-down coffee show their timestamps (#536).
	if _, err := pool.Exec(t.Context(), `UPDATE variants SET is_available = false, archived_at = now() WHERE id = $1`, variantID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), `UPDATE coffees SET removed_at = now() WHERE id = $1`, coffeeID); err != nil {
		t.Fatal(err)
	}
	doc, _ = export(seller)
	sc := doc["shop"].(map[string]any)["coffees"].([]any)[0].(map[string]any)
	if sc["takenDownAt"] == nil || sc["archivedAt"] != nil {
		t.Errorf("taken-down coffee stamps: takenDownAt=%v archivedAt=%v", sc["takenDownAt"], sc["archivedAt"])
	}
	archived, live := 0, 0
	for _, o := range sc["options"].([]any) {
		if o.(map[string]any)["archivedAt"] != nil {
			archived++
		} else {
			live++
		}
	}
	if archived != 1 {
		t.Errorf("archived options: %d, want 1 (live %d)", archived, live)
	}
	if cm := doc["comments"].([]any); len(cm) != 1 || cm[0].(map[string]any)["coffeeName"] == nil {
		t.Errorf("seller's comment on their own draft lost its name: %v", cm)
	}

	// Burst 3 per account: the buyer has used two, one more passes, then RATE_LIMITED.
	export(buyer)
	buyer.expectCode(graph.CodeRateLimited, q, nil)
}
