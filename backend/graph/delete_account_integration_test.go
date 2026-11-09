package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestDeleteAccount: the password is re-checked; shop owners and admins are
// refused; a deleted account's comments, saves and sessions go with it, and
// its email can register again. Requires TEST_DATABASE_URL.
func TestDeleteAccount(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "daseller+"+run+"@example.com")
	buyerEmail := "dabuyer+" + run + "@example.com"
	buyer, buyerAuth := register(t, url, buyerEmail)
	admin, adminAuth := register(t, url, "daadmin+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'ADMIN' WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	// The role is read from the token, so sign in again as admin.
	var relog struct{ Login authPayload }
	admin.mustDo(`mutation($in: LoginInput!) { login(input: $in) { `+authFields+` } }`,
		map[string]any{"in": map[string]any{"email": "daadmin+" + run + "@example.com", "password": "correct-horse-battery"}}, &relog)
	admin.token = relog.Login.AccessToken

	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "da-" + run, "name": "刪除測試", "description": "", "city": "高雄市"}}, nil)
	// The seller's token still says BUYER; deletion must look at the shop, not the role.
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var co struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": map[string]any{
			"name": "Delete Me Not", "description": "", "roastLevel": "DARK", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 380, "stock": 2}},
		}}, &co)
	coffeeID := co.CreateCoffee.ID
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)

	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "再見"}}, nil)
	buyer.mustDo(`mutation($id: ID!) { saveCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)

	const del = `mutation($p: String!) { deleteAccount(password: $p) }`
	pw := map[string]any{"p": "correct-horse-battery"}
	errCases := []struct {
		name   string
		client *gqlClient
		vars   map[string]any
		code   string
	}{
		{"signed out", anon, pw, graph.CodeUnauthenticated},
		{"wrong password", buyer, map[string]any{"p": "nope-nope-nope"}, graph.CodeBadInput},
		{"blank password", buyer, map[string]any{"p": ""}, graph.CodeBadInput},
		{"shop owner", seller, pw, graph.CodeForbidden},
		{"admin", admin, pw, graph.CodeForbidden},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.client.t = t
			defer func() { tc.client.t = nil }()
			tc.client.expectCode(tc.code, del, tc.vars)
		})
	}
	anon.t, buyer.t, seller.t = t, t, t

	var out struct{ DeleteAccount bool }
	buyer.mustDo(del, pw, &out)
	if !out.DeleteAccount {
		t.Fatal("deleteAccount returned false")
	}

	var n int
	for _, q := range []string{
		`SELECT count(*) FROM users WHERE id = $1`,
		`SELECT count(*) FROM comments WHERE user_id = $1`,
		`SELECT count(*) FROM saved_coffees WHERE user_id = $1`,
		`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`,
	} {
		if err := pool.QueryRow(ctx, q, buyerAuth.User.ID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Errorf("%s: %d rows left", q, n)
		}
	}
	var view struct {
		Coffee struct{ CommentCount, SaveCount int }
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { commentCount saveCount } }`, map[string]any{"id": coffeeID}, &view)
	if view.Coffee.CommentCount != 0 || view.Coffee.SaveCount != 0 {
		t.Fatalf("coffee still counts the deleted account: %+v", view.Coffee)
	}

	// The old session is gone; the still-valid access token can't write.
	anon.expectCode(graph.CodeUnauthenticated, `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`,
		map[string]any{"t": buyerAuth.RefreshToken})
	buyer.expectCode(graph.CodeUnauthenticated, `mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "還在嗎"}})
	buyer.expectCode(graph.CodeUnauthenticated, del, pw)
	var me struct{ Me *struct{ ID string } }
	buyer.mustDo(`{ me { id } }`, nil, &me)
	if me.Me != nil {
		t.Fatalf("me after delete = %+v", me.Me)
	}

	// The email is free again.
	register(t, url, buyerEmail)
}
