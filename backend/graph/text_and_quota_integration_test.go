package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestUploadQuota: a shop's presigns count against UploadDailyBytes (declared
// size), the error is UPLOAD_QUOTA, and another shop's budget is separate.
// Requires TEST_DATABASE_URL.
func TestUploadQuota(t *testing.T) {
	url, _ := newTestServerWith(t, func(r *graph.Resolver) { r.UploadDailyBytes = 300 })
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	mkShop := func(tag string) (*gqlClient, string) {
		c, _ := register(t, url, tag+"+"+run+"@example.com")
		var shop struct{ CreateShop struct{ ID string } }
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": tag + "-" + run, "name": "額度測試", "description": "", "city": "台南市"}}, &shop)
		return c, shop.CreateShop.ID
	}
	a, shopA := mkShop("quota-a")
	b, shopB := mkShop("quota-b")

	const q = `mutation($in: ImageUploadInput!) { createImageUpload(input: $in) { publicUrl } }`
	in := func(target string, size int) map[string]any {
		return map[string]any{"in": map[string]any{"kind": "SHOP_LOGO", "targetId": target, "contentType": "image/png", "byteSize": size}}
	}
	a.mustDo(q, in(shopA, 200), nil)
	a.expectCode(graph.CodeUploadQuota, q, in(shopA, 101))
	a.mustDo(q, in(shopA, 100), nil) // exactly the rest of the budget
	a.expectCode(graph.CodeUploadQuota, q, in(shopA, 1))
	b.mustDo(q, in(shopB, 300), nil)
}

// TestTextHygieneOverAPI: control and invisible formatting characters are
// refused with BAD_USER_INPUT, emoji joiners and multi-line descriptions pass.
func TestTextHygieneOverAPI(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	c, _ := register(t, url, "texthyg+"+run+"@example.com")
	const q = `mutation($in: CreateShopInput!) { createShop(input: $in) { id name description } }`
	shop := func(slug, name, desc string) map[string]any {
		return map[string]any{"in": map[string]any{"slug": slug, "name": name, "description": desc, "city": "台南市"}}
	}
	c.expectCode(graph.CodeBadInput, q, shop("th-nul-"+run, "a\x00b", ""))
	c.expectCode(graph.CodeBadInput, q, shop("th-rlo-"+run, "abc\u202edef", ""))
	c.expectCode(graph.CodeBadInput, q, shop("th-zws-"+run, "a\u200bb", ""))
	c.expectCode(graph.CodeBadInput, q, shop("th-desc-"+run, "ok", "a\x00b"))
	var out struct {
		CreateShop struct{ Name, Description string }
	}
	c.mustDo(q, shop("th-ok-"+run, "👩\u200d👩\u200d👧 咖啡", "line one\r\nline two"), &out)
	if out.CreateShop.Name != "👩\u200d👩\u200d👧 咖啡" || out.CreateShop.Description != "line one\nline two" {
		t.Errorf("stored %q / %q", out.CreateShop.Name, out.CreateShop.Description)
	}
}
