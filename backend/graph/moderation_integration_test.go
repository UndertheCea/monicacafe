package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestModeration (#224): admin-only fields refuse everyone else; suspending a
// shop hides it and its coffees from every public query (but not from its
// owner); suspending a user ends their sessions and hides their comments;
// every admin action needs a reason and lands in the audit log; a password
// change stops the old access token from writing. Requires TEST_DATABASE_URL.
func TestModeration(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	admin, adminAuth := register(t, url, "modadmin+"+run+"@example.com")
	seller, sellerAuth := register(t, url, "modseller+"+run+"@example.com")
	buyerEmail := "modbuyer+" + run + "@example.com"
	buyer, buyerAuth := register(t, url, buyerEmail)
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'ADMIN' WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	login := func(c *gqlClient, email string) authPayload {
		var out struct{ Login authPayload }
		anon.mustDo(`mutation($in: LoginInput!) { login(input: $in) { `+authFields+` } }`,
			map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}}, &out)
		c.token = out.Login.AccessToken
		return out.Login
	}
	login(admin, "modadmin+"+run+"@example.com")

	slug := "mod-" + run
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "停權測試 " + run, "description": "", "city": "台南市"}}, &shop)
	shopID := shop.CreateShop.ID
	publishTestCoffee(t, pool, shopID)
	var coffeeID string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1`, shopID).Scan(&coffeeID); err != nil {
		t.Fatal(err)
	}
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "好喝"}}, nil)

	reason := map[string]any{"id": sellerAuth.User.ID, "r": "spam"}
	adminFields := []struct {
		name, query string
		vars        map[string]any
	}{
		{"adminUsers", `{ adminUsers { total } }`, nil},
		{"adminShops", `{ adminShops { total } }`, nil},
		{"auditLog", `{ auditLog { total } }`, nil},
		{"suspendUser", `mutation($id: ID!, $r: String!) { suspendUser(id: $id, reason: $r) { id } }`, reason},
		{"unsuspendUser", `mutation($id: ID!, $r: String!) { unsuspendUser(id: $id, reason: $r) { id } }`, reason},
		{"suspendShop", `mutation($id: ID!, $r: String!) { suspendShop(id: $id, reason: $r) { id } }`,
			map[string]any{"id": shopID, "r": "spam"}},
		{"unsuspendShop", `mutation($id: ID!, $r: String!) { unsuspendShop(id: $id, reason: $r) { id } }`,
			map[string]any{"id": shopID, "r": "spam"}},
		{"adminUnpublishCoffee", `mutation($id: ID!, $r: String!) { adminUnpublishCoffee(id: $id, reason: $r) { id } }`,
			map[string]any{"id": coffeeID, "r": "spam"}},
	}
	callers := []struct {
		name   string
		client *gqlClient
		code   string
	}{
		{"anonymous", anon, graph.CodeUnauthenticated},
		{"buyer", buyer, graph.CodeForbidden},
		{"seller", seller, graph.CodeForbidden},
	}
	for _, f := range adminFields {
		for _, who := range callers {
			t.Run(f.name+"/"+who.name, func(t *testing.T) {
				who.client.t = t
				defer func() { who.client.t = nil }()
				who.client.expectCode(who.code, f.query, f.vars)
			})
		}
	}
	anon.t, buyer.t, seller.t = t, t, t

	// A token that merely claims ADMIN isn't enough: the role is re-read.
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'BUYER' WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	admin.expectCode(graph.CodeForbidden, `{ auditLog { total } }`, nil)
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'ADMIN' WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}

	// Reasons are required, and admins can't suspend themselves.
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { suspendShop(id: $id, reason: "  ") { id } }`,
		map[string]any{"id": shopID})
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { suspendUser(id: $id, reason: "x") { id } }`,
		map[string]any{"id": adminAuth.User.ID})

	// ── Suspend the shop ──────────────────────────────────────────────────────
	var susp struct{ SuspendShop struct{ Suspended bool } }
	admin.mustDo(`mutation($id: ID!) { suspendShop(id: $id, reason: "counterfeit") { suspended } }`,
		map[string]any{"id": shopID}, &susp)
	if !susp.SuspendShop.Suspended {
		t.Fatal("suspendShop should report suspended to the admin")
	}
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { suspendShop(id: $id, reason: "again") { id } }`,
		map[string]any{"id": shopID})

	type listed struct {
		Shop    *struct{ ID string }
		Coffee  *struct{ ID string }
		Shops   struct{ Nodes []struct{ ID string } }
		Coffees struct{ Nodes []struct{ ID string } }
		Popular []struct{ ID string } `json:"popularCoffees"`
		Map     []struct{ ID string } `json:"shopsForMap"`
	}
	const publicQ = `query($slug: String!, $id: ID!) {
		shop(slug: $slug) { id } coffee(id: $id) { id }
		shops(limit: 100) { nodes { id } } coffees(limit: 100) { nodes { id } }
		popularCoffees(limit: 100) { id } shopsForMap { id } }`
	visible := func(c *gqlClient) (shopSeen, coffeeSeen bool) {
		var out listed
		c.mustDo(publicQ, map[string]any{"slug": slug, "id": coffeeID}, &out)
		for _, n := range out.Shops.Nodes {
			shopSeen = shopSeen || n.ID == shopID
		}
		for _, n := range out.Map {
			shopSeen = shopSeen || n.ID == shopID
		}
		for _, n := range append(out.Coffees.Nodes, out.Popular...) {
			coffeeSeen = coffeeSeen || n.ID == coffeeID
		}
		return shopSeen || out.Shop != nil, coffeeSeen || out.Coffee != nil
	}
	for _, who := range []struct {
		name   string
		client *gqlClient
	}{{"anonymous", anon}, {"buyer", buyer}} {
		if s, c := visible(who.client); s || c {
			t.Fatalf("%s still sees the suspended shop (%v) or its coffee (%v)", who.name, s, c)
		}
	}
	// The owner still reaches the shop (with the notice flag) and its coffee.
	var own struct {
		Me     struct{ Shop *struct{ Suspended bool } }
		Coffee *struct{ ID string }
	}
	seller.mustDo(`query($id: ID!) { me { shop { suspended } } coffee(id: $id) { id } }`,
		map[string]any{"id": coffeeID}, &own)
	if own.Me.Shop == nil || !own.Me.Shop.Suspended || own.Coffee == nil {
		t.Fatalf("owner view of a suspended shop: %+v", own)
	}
	admin.mustDo(`mutation($id: ID!) { unsuspendShop(id: $id, reason: "resolved") { id } }`, map[string]any{"id": shopID}, nil)
	if s, c := visible(anon); !s || !c {
		t.Fatalf("after unsuspending, shop seen %v, coffee seen %v", s, c)
	}

	// ── Suspend the buyer ─────────────────────────────────────────────────────
	commentsQ := `query($id: ID!) { coffee(id: $id) { commentCount comments { id } } }`
	var cm struct {
		Coffee struct {
			CommentCount int
			Comments     []struct{ ID string }
		}
	}
	anon.mustDo(commentsQ, map[string]any{"id": coffeeID}, &cm)
	if cm.Coffee.CommentCount != 1 || len(cm.Coffee.Comments) != 1 {
		t.Fatalf("before suspension: %+v", cm)
	}
	admin.mustDo(`mutation($id: ID!) { suspendUser(id: $id, reason: "abuse") { id } }`,
		map[string]any{"id": buyerAuth.User.ID}, nil)
	anon.mustDo(commentsQ, map[string]any{"id": coffeeID}, &cm)
	if cm.Coffee.CommentCount != 0 || len(cm.Coffee.Comments) != 0 {
		t.Fatalf("a suspended user's comment is still shown: %+v", cm)
	}
	buyer.expectCode(graph.CodeUnauthenticated, `mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "still here"}})
	anon.expectCode(graph.CodeUnauthenticated, `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`,
		map[string]any{"t": buyerAuth.RefreshToken})
	anon.expectCode(graph.CodeForbidden, `mutation($in: LoginInput!) { login(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": buyerEmail, "password": "correct-horse-battery"}})
	admin.mustDo(`mutation($id: ID!) { unsuspendUser(id: $id, reason: "appeal") { id } }`,
		map[string]any{"id": buyerAuth.User.ID}, nil)
	login(buyer, buyerEmail)
	anon.mustDo(commentsQ, map[string]any{"id": coffeeID}, &cm)
	if len(cm.Coffee.Comments) != 1 {
		t.Fatalf("comment should be back after unsuspending: %+v", cm)
	}

	// ── Admin deletes a comment, unpublishes the coffee ───────────────────────
	admin.mustDo(`mutation($id: ID!) { deleteComment(id: $id, reason: "personal data") }`,
		map[string]any{"id": cm.Coffee.Comments[0].ID}, nil)
	admin.mustDo(`mutation($id: ID!) { adminUnpublishCoffee(id: $id, reason: "mislabelled") { id } }`,
		map[string]any{"id": coffeeID}, nil)
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { adminUnpublishCoffee(id: $id, reason: "again") { id } }`,
		map[string]any{"id": coffeeID})
	var gone struct{ Coffee *struct{ ID string } }
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, &gone)
	if gone.Coffee != nil {
		t.Fatal("unpublished coffee still public")
	}

	// ── Password change: the old access token stops writing at once ───────────
	old := buyer.token
	var pw struct{ ChangePassword authPayload }
	buyer.mustDo(`mutation { changePassword(input: {currentPassword: "correct-horse-battery", newPassword: "another-horse-battery"}) { `+authFields+` } }`, nil, &pw)
	buyer.token = old
	buyer.expectCode(graph.CodeUnauthenticated, `mutation { updateProfile(input: {displayName: "x"}) { id } }`, nil)
	buyer.token = pw.ChangePassword.AccessToken
	buyer.mustDo(`mutation { updateProfile(input: {displayName: "新名字"}) { id } }`, nil, nil)

	// ── The audit log has every action, newest first, with its actor ──────────
	var log struct {
		AuditLog struct {
			Nodes []struct {
				Action, TargetID, Reason string
				Actor                    *struct{ ID string }
			}
		}
	}
	admin.mustDo(`{ auditLog(limit: 100) { nodes { action targetId reason actor { id } } } }`, nil, &log)
	want := []struct{ action, target, reason, actor string }{
		{"CHANGE_PASSWORD", buyerAuth.User.ID, "", buyerAuth.User.ID},
		{"UNPUBLISH_COFFEE", coffeeID, "mislabelled", adminAuth.User.ID},
		{"DELETE_COMMENT", "", "personal data", adminAuth.User.ID},
		{"UNSUSPEND_USER", buyerAuth.User.ID, "appeal", adminAuth.User.ID},
		{"SUSPEND_USER", buyerAuth.User.ID, "abuse", adminAuth.User.ID},
		{"UNSUSPEND_SHOP", shopID, "resolved", adminAuth.User.ID},
		{"SUSPEND_SHOP", shopID, "counterfeit", adminAuth.User.ID},
	}
	// Other tests share the database: keep only this test's targets, in order.
	var mine []int
	for i, n := range log.AuditLog.Nodes {
		if n.TargetID == buyerAuth.User.ID || n.TargetID == coffeeID || n.TargetID == shopID || n.Action == "DELETE_COMMENT" && n.Reason == "personal data" {
			mine = append(mine, i)
		}
	}
	if len(mine) < len(want) {
		t.Fatalf("audit log has %d of this test's entries, want %d: %+v", len(mine), len(want), log.AuditLog.Nodes)
	}
	for k, w := range want {
		n := log.AuditLog.Nodes[mine[k]]
		if n.Action != w.action || (w.target != "" && n.TargetID != w.target) || n.Reason != w.reason ||
			n.Actor == nil || n.Actor.ID != w.actor {
			t.Errorf("audit entry %d = %+v, want %+v", k, n, w)
		}
	}

	// The log is append-only, even for the database owner.
	if _, err := pool.Exec(ctx, `DELETE FROM audit_log WHERE target_id = $1`, shopID); err == nil {
		t.Fatal("deleting audit rows should fail")
	}
}
