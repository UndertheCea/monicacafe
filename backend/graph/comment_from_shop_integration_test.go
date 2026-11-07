package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestCommentFromShop checks Comment.fromShop on every path that returns
// comments: true only for the coffee's shop owner. Requires TEST_DATABASE_URL.
func TestCommentFromShop(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "fsseller+"+run+"@example.com")
	other, _ := register(t, url, "fsother+"+run+"@example.com")
	buyer, _ := register(t, url, "fsbuyer+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	var shop struct{ CreateShop struct{ Slug string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { slug } }`,
		map[string]any{"in": map[string]any{"slug": "fs-" + run, "name": "店家留言", "description": "", "city": "台中市"}}, &shop)
	// Another seller: owning *a* shop isn't enough, it must be this coffee's.
	other.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "fs2-" + run, "name": "別家", "description": "", "city": "台北市"}}, nil)

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var co struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": map[string]any{
			"name": "From Shop", "description": "", "roastLevel": "LIGHT",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}}, &co)
	coffeeID := co.CreateCoffee.ID
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)

	type added struct {
		AddComment struct {
			ID       string
			FromShop bool
		}
	}
	add := func(c *gqlClient, body string) added {
		var out added
		c.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id fromShop } }`,
			map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": body}}, &out)
		return out
	}
	want := map[string]bool{}
	for _, tc := range []struct {
		name   string
		client *gqlClient
		body   string
		want   bool
	}{
		{"buyer", buyer, "請問適合手沖嗎？", false},
		{"other seller", other, "看起來不錯", false},
		{"shop owner", seller, "適合，建議 92 度", true},
	} {
		got := add(tc.client, tc.body)
		if got.AddComment.FromShop != tc.want {
			t.Errorf("addComment by %s: fromShop = %v, want %v", tc.name, got.AddComment.FromShop, tc.want)
		}
		want[got.AddComment.ID] = tc.want
	}

	type node struct {
		ID       string
		FromShop bool
	}
	check := func(where string, nodes []node) {
		t.Helper()
		if len(nodes) == 0 {
			t.Fatalf("%s: no comments", where)
		}
		for _, n := range nodes {
			if w, ok := want[n.ID]; ok && n.FromShop != w {
				t.Errorf("%s: comment %s fromShop = %v, want %v", where, n.ID, n.FromShop, w)
			}
		}
	}

	var byCoffee struct{ Coffee struct{ Comments []node } }
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { comments { id fromShop } } }`, map[string]any{"id": coffeeID}, &byCoffee)
	if len(byCoffee.Coffee.Comments) != 3 {
		t.Fatalf("coffee comments = %d, want 3", len(byCoffee.Coffee.Comments))
	}
	check("Coffee.comments", byCoffee.Coffee.Comments)

	var byShop struct {
		Shop struct{ RecentComments struct{ Nodes []node } }
	}
	seller.mustDo(`query($slug: String!) { shop(slug: $slug) { recentComments { nodes { id fromShop } } } }`,
		map[string]any{"slug": shop.CreateShop.Slug}, &byShop)
	check("Shop.recentComments", byShop.Shop.RecentComments.Nodes)

	var mine struct {
		Me struct{ Comments struct{ Nodes []node } }
	}
	seller.mustDo(`{ me { comments { nodes { id fromShop } } } }`, nil, &mine)
	check("User.comments", mine.Me.Comments.Nodes)

	var ownerID string
	for id, w := range want {
		if w {
			ownerID = id
		}
	}
	var edited struct{ UpdateComment node }
	seller.mustDo(`mutation($id: ID!, $body: String!) { updateComment(id: $id, body: $body) { id fromShop } }`,
		map[string]any{"id": ownerID, "body": "適合，建議 90–92 度"}, &edited)
	check("updateComment", []node{edited.UpdateComment})
	// Unchanged text takes the no-op branch of the update query.
	seller.mustDo(`mutation($id: ID!, $body: String!) { updateComment(id: $id, body: $body) { id fromShop } }`,
		map[string]any{"id": ownerID, "body": "適合，建議 90–92 度"}, &edited)
	check("updateComment (unchanged)", []node{edited.UpdateComment})
}
