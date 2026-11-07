package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestFollowShops covers followShop / unfollowShop, Shop.isFollowed and
// followerCount, and User.followedShops: owners can't follow themselves, both
// mutations are idempotent, the list is newest first and private.
// Requires TEST_DATABASE_URL.
func TestFollowShops(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	sellerA, _ := register(t, url, "fwa+"+run+"@example.com")
	sellerB, _ := register(t, url, "fwb+"+run+"@example.com")
	buyer, _ := register(t, url, "fwbuyer+"+run+"@example.com")
	other, _ := register(t, url, "fwother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	newShop := func(c *gqlClient, slug string) string {
		var r struct{ CreateShop struct{ ID string } }
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": slug, "name": "追蹤 " + slug, "description": "", "city": "台北市"}}, &r)
		return r.CreateShop.ID
	}
	shopA := newShop(sellerA, "fw-a-"+run)
	shopB := newShop(sellerB, "fw-b-"+run)

	const follow = `mutation($id: ID!) { followShop(id: $id) { id isFollowed followerCount } }`
	const unfollow = `mutation($id: ID!) { unfollowShop(id: $id) { id isFollowed followerCount } }`
	type state struct {
		ID            string
		IsFollowed    bool
		FollowerCount int
	}

	errCases := []struct {
		name   string
		client *gqlClient
		query  string
		id     string
		code   string
	}{
		{"follow signed out", anon, follow, shopA, graph.CodeUnauthenticated},
		{"unfollow signed out", anon, unfollow, shopA, graph.CodeUnauthenticated},
		{"follow own shop", sellerA, follow, shopA, graph.CodeBadInput},
		{"follow unknown", buyer, follow, "00000000-0000-0000-0000-000000000000", graph.CodeNotFound},
		{"follow bad id", buyer, follow, "nope", graph.CodeNotFound},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.client.t = t
			defer func() { tc.client.t = nil }()
			tc.client.expectCode(tc.code, tc.query, map[string]any{"id": tc.id})
		})
	}
	anon.t, buyer.t, sellerA.t, sellerB.t, other.t = t, t, t, t, t

	var f struct{ FollowShop state }
	buyer.mustDo(follow, map[string]any{"id": shopA}, &f)
	if !f.FollowShop.IsFollowed || f.FollowShop.FollowerCount != 1 {
		t.Fatalf("after follow: %+v", f.FollowShop)
	}
	buyer.mustDo(follow, map[string]any{"id": shopA}, &f) // idempotent
	if f.FollowShop.FollowerCount != 1 {
		t.Fatalf("following twice counted twice: %+v", f.FollowShop)
	}
	sellerB.mustDo(follow, map[string]any{"id": shopA}, &f) // a seller can follow another shop
	if f.FollowShop.FollowerCount != 2 {
		t.Fatalf("second follower: %+v", f.FollowShop)
	}
	buyer.mustDo(follow, map[string]any{"id": shopB}, &f)

	const view = `query($slug: String!) { shop(slug: $slug) { isFollowed followerCount } }`
	var v struct {
		Shop struct {
			IsFollowed    bool
			FollowerCount int
		}
	}
	anon.mustDo(view, map[string]any{"slug": "fw-a-" + run}, &v)
	if v.Shop.IsFollowed || v.Shop.FollowerCount != 2 {
		t.Fatalf("anonymous view: %+v", v.Shop)
	}
	other.mustDo(view, map[string]any{"slug": "fw-a-" + run}, &v)
	if v.Shop.IsFollowed {
		t.Fatal("isFollowed leaked across viewers")
	}

	type listResp struct {
		Me struct {
			FollowedShops struct {
				Total int
				Nodes []struct {
					ID         string
					IsFollowed bool
				}
			}
		}
	}
	var l listResp
	buyer.mustDo(`{ me { followedShops { total nodes { id isFollowed } } } }`, nil, &l)
	if got := l.Me.FollowedShops; got.Total != 2 || len(got.Nodes) != 2 || got.Nodes[0].ID != shopB || got.Nodes[1].ID != shopA || !got.Nodes[0].IsFollowed {
		t.Fatalf("followedShops: %+v", got)
	}
	buyer.mustDo(`{ me { followedShops(limit: 1, offset: 1) { total nodes { id } } } }`, nil, &l)
	if got := l.Me.FollowedShops; got.Total != 2 || len(got.Nodes) != 1 || got.Nodes[0].ID != shopA {
		t.Fatalf("paged followedShops: %+v", got)
	}

	// Someone who follows nothing has an empty list.
	other.mustDo(`{ me { followedShops { total } } }`, nil, &l)
	if l.Me.FollowedShops.Total != 0 {
		t.Fatalf("other user sees follows: %+v", l.Me.FollowedShops)
	}

	var u struct{ UnfollowShop *state }
	buyer.mustDo(unfollow, map[string]any{"id": shopA}, &u)
	if u.UnfollowShop == nil || u.UnfollowShop.IsFollowed || u.UnfollowShop.FollowerCount != 1 {
		t.Fatalf("after unfollow: %+v", u.UnfollowShop)
	}
	buyer.mustDo(unfollow, map[string]any{"id": shopA}, &u) // idempotent
	if u.UnfollowShop == nil || u.UnfollowShop.FollowerCount != 1 {
		t.Fatalf("unfollow twice: %+v", u.UnfollowShop)
	}
	buyer.mustDo(unfollow, map[string]any{"id": "00000000-0000-0000-0000-000000000000"}, &u)
	if u.UnfollowShop != nil {
		t.Fatalf("unfollow unknown shop returned %+v", u.UnfollowShop)
	}
}
