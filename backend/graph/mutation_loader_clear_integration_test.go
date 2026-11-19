package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestMutationsClearLoaderKeys sends follow + unfollow (and save + unsave) as
// two aliases of one request. The request-scoped loaders must not hand the
// second alias the value cached by the first (#360). Requires TEST_DATABASE_URL.
func TestMutationsClearLoaderKeys(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "lc+"+run+"@example.com")
	buyer, _ := register(t, url, "lcbuyer+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	var sh struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "lc-" + run, "name": "快取測試", "description": "", "city": "台北市"}}, &sh)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var co struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": withEssentials(t, map[string]any{
			"name": "Cache", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 450, "stock": 5}},
		})}, &co)
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": co.CreateCoffee.ID}, nil)

	type pair struct {
		On    bool
		Count int
	}
	cases := []struct {
		name, query string
		id          string
	}{
		{"follow then unfollow",
			`mutation($id: ID!) { a: followShop(id: $id) { on: isFollowed count: followerCount } b: unfollowShop(id: $id) { on: isFollowed count: followerCount } }`,
			sh.CreateShop.ID},
		{"save then unsave",
			`mutation($id: ID!) { a: saveCoffee(id: $id) { on: isSaved count: saveCount } b: unsaveCoffee(id: $id) { on: isSaved count: saveCount } }`,
			co.CreateCoffee.ID},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			buyer.t = t
			var r struct{ A, B pair }
			buyer.mustDo(tc.query, map[string]any{"id": tc.id}, &r)
			if r.A != (pair{true, 1}) {
				t.Errorf("a = %+v, want {true 1}", r.A)
			}
			if r.B != (pair{false, 0}) {
				t.Errorf("b = %+v, want {false 0}", r.B)
			}
		})
	}

	// #401: an uppercase spelling of the ID reaches the row (Postgres reads it,
	// #333) and must clear the same loader keys, or unsave answers isSaved: true.
	upper := []struct{ name, query, id string }{
		{"unfollow by uppercase id",
			`mutation($id: ID!, $up: ID!) { a: followShop(id: $id) { on: isFollowed count: followerCount } b: unfollowShop(id: $up) { on: isFollowed count: followerCount } }`,
			sh.CreateShop.ID},
		{"unsave by uppercase id",
			`mutation($id: ID!, $up: ID!) { a: saveCoffee(id: $id) { on: isSaved count: saveCount } b: unsaveCoffee(id: $up) { on: isSaved count: saveCount } }`,
			co.CreateCoffee.ID},
	}
	for _, tc := range upper {
		t.Run(tc.name, func(t *testing.T) {
			buyer.t = t
			var r struct{ A, B pair }
			buyer.mustDo(tc.query, map[string]any{"id": tc.id, "up": strings.ToUpper(tc.id)}, &r)
			if r.A != (pair{true, 1}) || r.B != (pair{false, 0}) {
				t.Errorf("a = %+v, b = %+v; want {true 1}, {false 0}", r.A, r.B)
			}
		})
	}

	// #409: comment counts and a shop's coffee count, read by the first alias,
	// must not be handed to the second.
	t.Run("two comments", func(t *testing.T) {
		buyer.t = t
		var r struct {
			A, B struct{ Coffee struct{ CommentCount int } }
		}
		buyer.mustDo(`mutation($id: ID!) {
			a: addComment(input: {coffeeId: $id, body: "first"}) { coffee { commentCount } }
			b: addComment(input: {coffeeId: $id, body: "second"}) { coffee { commentCount } } }`,
			map[string]any{"id": co.CreateCoffee.ID}, &r)
		if r.A.Coffee.CommentCount != 1 || r.B.Coffee.CommentCount != 2 {
			t.Errorf("commentCount a = %d, b = %d; want 1, 2", r.A.Coffee.CommentCount, r.B.Coffee.CommentCount)
		}
	})
	t.Run("unpublish then publish", func(t *testing.T) {
		seller.t = t
		var r struct {
			A, B struct{ Shop struct{ CoffeeCount int } }
		}
		seller.mustDo(`mutation($id: ID!) {
			a: unpublishCoffee(id: $id) { shop { coffeeCount } }
			b: publishCoffee(id: $id) { shop { coffeeCount } } }`,
			map[string]any{"id": co.CreateCoffee.ID}, &r)
		if r.A.Shop.CoffeeCount != 0 || r.B.Shop.CoffeeCount != 1 {
			t.Errorf("coffeeCount a = %d, b = %d; want 0, 1", r.A.Shop.CoffeeCount, r.B.Shop.CoffeeCount)
		}
	})
}
