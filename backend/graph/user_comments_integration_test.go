package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestUserComments: me.comments lists the viewer's own comments newest first
// and paged; another viewer sees an empty list for the same user; a comment
// on a coffee that went back to draft keeps listing with coffee = null for
// its author, while the shop owner still sees the coffee. Requires
// TEST_DATABASE_URL.
func TestUserComments(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "ucseller+"+run+"@example.com")
	buyer, buyerAuth := register(t, url, "ucbuyer+"+run+"@example.com")
	other, _ := register(t, url, "ucother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "uc-" + run, "name": "我的留言", "description": "", "city": "高雄市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var ids []string
	for _, name := range []string{"Keep", "Hide"} {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": "", "roastLevel": "DARK", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		ids = append(ids, out.CreateCoffee.ID)
	}
	for i, id := range []string{ids[0], ids[1], ids[0]} {
		buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"coffeeId": id, "body": fmt.Sprintf("m%d", i+1)}}, nil)
		time.Sleep(5 * time.Millisecond)
	}
	other.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": ids[0], "body": "not mine"}}, nil)
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": ids[1]}, nil)

	type conn struct {
		Total int
		Nodes []struct {
			Body   string
			Coffee *struct{ Name string }
		}
	}
	const q = `query($limit: Int, $offset: Int) { me { comments(limit: $limit, offset: $offset) { total nodes { body coffee { name } } } } }`
	var p1, p2 struct{ Me struct{ Comments conn } }
	buyer.mustDo(q, map[string]any{"limit": 2, "offset": 0}, &p1)
	buyer.mustDo(q, map[string]any{"limit": 2, "offset": 2}, &p2)
	if p1.Me.Comments.Total != 3 || len(p1.Me.Comments.Nodes) != 2 || len(p2.Me.Comments.Nodes) != 1 {
		t.Fatalf("paging: %+v / %+v", p1.Me.Comments, p2.Me.Comments)
	}
	n := append(p1.Me.Comments.Nodes, p2.Me.Comments.Nodes...)
	if got := fmt.Sprint(n[0].Body, n[1].Body, n[2].Body); got != "m3m2m1" {
		t.Errorf("order %q, want m3 m2 m1", got)
	}
	if n[0].Coffee == nil || n[0].Coffee.Name != "Keep" {
		t.Errorf("published coffee: %+v", n[0].Coffee)
	}
	if n[1].Coffee != nil {
		t.Errorf("draft coffee leaked to a non-owner: %+v", n[1].Coffee)
	}

	// The same user seen by others (as a comment author): empty, no error.
	const viaCoffee = `query($id: ID!) { coffee(id: $id) { comments { user { id comments { total nodes { body } } } } } }`
	var seen struct {
		Coffee struct {
			Comments []struct {
				User struct {
					ID       string
					Comments conn
				}
			}
		}
	}
	for name, c := range map[string]*gqlClient{"other user": other, "anonymous": anon} {
		c.mustDo(viaCoffee, map[string]any{"id": ids[0]}, &seen)
		for _, cm := range seen.Coffee.Comments {
			if cm.User.ID == buyerAuth.User.ID && (cm.User.Comments.Total != 0 || len(cm.User.Comments.Nodes) != 0) {
				t.Errorf("%s sees the buyer's comments: %+v", name, cm.User.Comments)
			}
		}
	}

	// The shop owner still sees the draft through Shop.recentComments.
	var own struct {
		Me struct {
			Shop struct{ RecentComments conn }
		}
	}
	seller.mustDo(`{ me { shop { recentComments { total nodes { body coffee { name } } } } } }`, nil, &own)
	for _, c := range own.Me.Shop.RecentComments.Nodes {
		if c.Body == "m2" && (c.Coffee == nil || c.Coffee.Name != "Hide") {
			t.Errorf("owner should see the draft coffee: %+v", c.Coffee)
		}
	}
}
