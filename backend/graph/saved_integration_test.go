package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// TestSavedCoffees covers saveCoffee / unsaveCoffee, Coffee.isSaved and
// saveCount, and User.savedCoffees: drafts can't be saved, both mutations are
// idempotent, a coffee back in draft drops out of the list but can still be
// unsaved, and nobody else sees the list. Requires TEST_DATABASE_URL.
func TestSavedCoffees(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "svseller+"+run+"@example.com")
	buyer, _ := register(t, url, "svbuyer+"+run+"@example.com")
	other, _ := register(t, url, "svother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "sv-" + run, "name": "收藏測試", "description": "", "city": "台中市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	newCoffee := func(name string, publish bool) string {
		var co struct{ CreateCoffee struct{ ID string } }
		seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
			map[string]any{"in": map[string]any{
				"name": name, "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
				"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
				"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 450, "stock": 5}},
			}}, &co)
		if publish {
			seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": co.CreateCoffee.ID}, nil)
		}
		return co.CreateCoffee.ID
	}
	first := newCoffee("First", true)
	second := newCoffee("Second", true)
	draft := newCoffee("Draft", false)

	const save = `mutation($id: ID!) { saveCoffee(id: $id) { id isSaved saveCount } }`
	const unsave = `mutation($id: ID!) { unsaveCoffee(id: $id) { id isSaved saveCount } }`
	type state struct {
		ID        string
		IsSaved   bool
		SaveCount int
	}

	errCases := []struct {
		name   string
		client *gqlClient
		query  string
		id     string
		code   string
	}{
		{"save signed out", anon, save, first, graph.CodeUnauthenticated},
		{"unsave signed out", anon, unsave, first, graph.CodeUnauthenticated},
		{"save draft", buyer, save, draft, graph.CodeNotFound},
		{"save own draft", seller, save, draft, graph.CodeNotFound},
		{"save unknown", buyer, save, "00000000-0000-0000-0000-000000000000", graph.CodeNotFound},
		{"save bad id", buyer, save, "nope", graph.CodeNotFound},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.client.t = t
			defer func() { tc.client.t = nil }()
			tc.client.expectCode(tc.code, tc.query, map[string]any{"id": tc.id})
		})
	}
	anon.t, buyer.t, seller.t, other.t = t, t, t, t

	var s struct{ SaveCoffee state }
	buyer.mustDo(save, map[string]any{"id": first}, &s)
	if !s.SaveCoffee.IsSaved || s.SaveCoffee.SaveCount != 1 {
		t.Fatalf("after save: %+v", s.SaveCoffee)
	}
	buyer.mustDo(save, map[string]any{"id": first}, &s) // idempotent
	if s.SaveCoffee.SaveCount != 1 {
		t.Fatalf("saving twice counted twice: %+v", s.SaveCoffee)
	}
	other.mustDo(save, map[string]any{"id": first}, &s)
	if s.SaveCoffee.SaveCount != 2 {
		t.Fatalf("second user's save: %+v", s.SaveCoffee)
	}
	buyer.mustDo(save, map[string]any{"id": second}, &s)

	// isSaved is per viewer; saveCount is public.
	const view = `query($id: ID!) { coffee(id: $id) { isSaved saveCount } }`
	var v struct {
		Coffee struct {
			IsSaved   bool
			SaveCount int
		}
	}
	anon.mustDo(view, map[string]any{"id": first}, &v)
	if v.Coffee.IsSaved || v.Coffee.SaveCount != 2 {
		t.Fatalf("anonymous view: %+v", v.Coffee)
	}
	seller.mustDo(view, map[string]any{"id": first}, &v)
	if v.Coffee.IsSaved {
		t.Fatal("seller sees the buyer's save as their own")
	}

	const mine = `{ me { savedCoffees { total nodes { id isSaved } } } }`
	type listResp struct {
		Me struct {
			SavedCoffees struct {
				Total int
				Nodes []struct {
					ID      string
					IsSaved bool
				}
			}
		}
	}
	var l listResp
	buyer.mustDo(mine, nil, &l)
	if got := l.Me.SavedCoffees; got.Total != 2 || len(got.Nodes) != 2 || got.Nodes[0].ID != second || got.Nodes[1].ID != first || !got.Nodes[0].IsSaved {
		t.Fatalf("saved list (newest first): %+v", got)
	}
	var paged struct {
		Me struct {
			SavedCoffees struct {
				Total int
				Nodes []struct{ ID string }
			}
		}
	}
	buyer.mustDo(`{ me { savedCoffees(limit: 1, offset: 1) { total nodes { id } } } }`, nil, &paged)
	if p := paged.Me.SavedCoffees; p.Total != 2 || len(p.Nodes) != 1 || p.Nodes[0].ID != first {
		t.Fatalf("second page: %+v", p)
	}

	// Somebody else's list is empty, not an error (User appears on comments).
	var others struct {
		Coffee struct {
			Comments []struct {
				User struct{ SavedCoffees struct{ Total int } }
			}
		}
	}
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": first, "body": "想喝"}}, nil)
	other.mustDo(`query($id: ID!) { coffee(id: $id) { comments { user { savedCoffees { total } } } } }`,
		map[string]any{"id": first}, &others)
	if len(others.Coffee.Comments) != 1 || others.Coffee.Comments[0].User.SavedCoffees.Total != 0 {
		t.Fatalf("another user's saved list leaked: %+v", others.Coffee.Comments)
	}

	// Back in draft: hidden from the list, still unsavable; unsave returns
	// null to someone who can't see the draft.
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": second}, nil)
	buyer.mustDo(mine, nil, &l)
	if got := l.Me.SavedCoffees; got.Total != 1 || got.Nodes[0].ID != first {
		t.Fatalf("draft still listed: %+v", got)
	}
	var u struct{ UnsaveCoffee *state }
	buyer.mustDo(unsave, map[string]any{"id": second}, &u)
	if u.UnsaveCoffee != nil {
		t.Fatalf("unsave of someone else's draft returned it: %+v", u.UnsaveCoffee)
	}
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": second}, nil)
	buyer.mustDo(mine, nil, &l)
	if l.Me.SavedCoffees.Total != 1 {
		t.Fatalf("unsaved draft came back on republish: %+v", l.Me.SavedCoffees)
	}

	buyer.mustDo(unsave, map[string]any{"id": first}, &u)
	if u.UnsaveCoffee == nil || u.UnsaveCoffee.IsSaved || u.UnsaveCoffee.SaveCount != 1 {
		t.Fatalf("after unsave: %+v", u.UnsaveCoffee)
	}
	buyer.mustDo(unsave, map[string]any{"id": first}, &u) // idempotent
	buyer.mustDo(unsave, map[string]any{"id": "nope"}, &u)
	if u.UnsaveCoffee != nil {
		t.Fatal("unsave of a bad id returned a coffee")
	}
}

// TestSaveRateLimit: saves and unsaves share one per-user bucket.
func TestSaveRateLimit(t *testing.T) {
	url, _ := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{SaveUser: ratelimit.New(ratelimit.Rule{Burst: 2, Per: time.Hour})}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	buyer, _ := register(t, url, "svlimit+"+run+"@example.com")
	var popular struct{ PopularCoffees []struct{ ID string } }
	buyer.mustDo(`{ popularCoffees(limit: 1) { id } }`, nil, &popular)
	if len(popular.PopularCoffees) == 0 {
		t.Skip("no published coffees in the test database")
	}
	id := popular.PopularCoffees[0].ID
	buyer.mustDo(`mutation($id: ID!) { saveCoffee(id: $id) { id } }`, map[string]any{"id": id}, nil)
	buyer.mustDo(`mutation($id: ID!) { unsaveCoffee(id: $id) { id } }`, map[string]any{"id": id}, nil)
	buyer.expectCode(graph.CodeRateLimited, `mutation($id: ID!) { saveCoffee(id: $id) { id } }`, map[string]any{"id": id})
}
