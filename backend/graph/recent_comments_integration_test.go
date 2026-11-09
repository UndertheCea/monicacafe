package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestShopRecentComments: the owner lists comments across all of their
// coffees, newest first and paged; others are refused; Comment.coffee hides a
// draft from everyone but its owner. Requires TEST_DATABASE_URL.
func TestShopRecentComments(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "recent+"+run+"@example.com")
	buyer, _ := register(t, url, "recentbuyer+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	slug := "recent-" + run
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "留言店", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var ids []string
	for _, name := range []string{"A", "B"} {
		var out struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
			}}, &out)
		seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
		ids = append(ids, out.CreateCoffee.ID)
	}
	// Comments alternate between the two coffees: 1→A, 2→B, 3→A.
	for i, id := range []string{ids[0], ids[1], ids[0]} {
		buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"coffeeId": id, "body": fmt.Sprintf("c%d", i+1)}}, nil)
		time.Sleep(5 * time.Millisecond) // distinct created_at
	}
	// B becomes a draft: its comments stay listed for the owner.
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": ids[1]}, nil)

	const q = `query($limit: Int, $offset: Int) { me { shop {
		recentComments(limit: $limit, offset: $offset) { total nodes { body user { displayName } coffee { id name isPublished } } } } } }`
	type page struct {
		Me struct {
			Shop struct {
				RecentComments struct {
					Total int
					Nodes []struct {
						Body   string
						Coffee *struct {
							ID, Name    string
							IsPublished bool
						}
					}
				}
			}
		}
	}
	var p1, p2 page
	seller.mustDo(q, map[string]any{"limit": 2, "offset": 0}, &p1)
	seller.mustDo(q, map[string]any{"limit": 2, "offset": 2}, &p2)
	rc := p1.Me.Shop.RecentComments
	if rc.Total != 3 || len(rc.Nodes) != 2 || len(p2.Me.Shop.RecentComments.Nodes) != 1 {
		t.Fatalf("paging: total %d, page sizes %d / %d", rc.Total, len(rc.Nodes), len(p2.Me.Shop.RecentComments.Nodes))
	}
	got := []string{rc.Nodes[0].Body, rc.Nodes[1].Body, p2.Me.Shop.RecentComments.Nodes[0].Body}
	if fmt.Sprint(got) != "[c3 c2 c1]" {
		t.Errorf("order %v, want newest first", got)
	}
	if c := rc.Nodes[1].Coffee; c == nil || c.Name != "B" || c.IsPublished {
		t.Errorf("owner should see the draft coffee B, got %+v", c)
	}

	// Through the public shop field: buyers are forbidden, anonymous must sign in.
	const pub = `query($slug: String!) { shop(slug: $slug) { recentComments { total } } }`
	buyer.expectCode("FORBIDDEN", pub, map[string]any{"slug": slug})
	anon.expectCode("UNAUTHENTICATED", pub, map[string]any{"slug": slug})

	// Comment.coffee on the published coffee: visible to anyone.
	const cq = `query($id: ID!) { coffee(id: $id) { comments { body coffee { id } } } }`
	var pubOut struct {
		Coffee struct {
			Comments []struct {
				Body   string
				Coffee *struct{ ID string }
			}
		}
	}
	anon.mustDo(cq, map[string]any{"id": ids[0]}, &pubOut)
	if len(pubOut.Coffee.Comments) != 2 {
		t.Fatalf("want 2 comments on A, got %d", len(pubOut.Coffee.Comments))
	}
	for _, c := range pubOut.Coffee.Comments {
		if c.Coffee == nil || c.Coffee.ID != ids[0] {
			t.Errorf("comment %s: coffee %+v, want %s", c.Body, c.Coffee, ids[0])
		}
	}
}
