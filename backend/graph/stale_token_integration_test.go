package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestStaleTokensReadNothingPrivate (#284): queries check the access token
// against the database like mutations do. After a password change the old
// token gets UNAUTHENTICATED from me, myDataExport and cart; after an admin
// revoke the old token loses admin views and other people's emails at once,
// while public data still loads. Requires TEST_DATABASE_URL.
func TestStaleTokensReadNothingPrivate(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	buyerEmail := "stalebuyer+" + run + "@example.com"
	buyer, buyerAuth := register(t, url, buyerEmail)
	adminEmail := "staleadmin+" + run + "@example.com"
	admin, _ := register(t, url, adminEmail)

	// ── Password change ───────────────────────────────────────────────────────
	private := []string{
		`{ me { id email } }`,
		`{ myDataExport }`,
		`{ cart { items { id } } }`,
	}
	for _, q := range private {
		buyer.mustDo(q, nil, nil)
	}
	old := buyer.token
	var pw struct{ ChangePassword authPayload }
	buyer.mustDo(`mutation { changePassword(input: {currentPassword: "correct-horse-battery", newPassword: "another-horse-battery"}) { `+authFields+` } }`, nil, &pw)
	buyer.token = old
	for _, q := range private {
		buyer.expectCode(graph.CodeUnauthenticated, q, nil)
	}
	buyer.mustDo(`{ shopsForMap { id } }`, nil, nil) // public data still loads, as anonymous
	buyer.token = pw.ChangePassword.AccessToken
	var me struct{ Me struct{ ID string } }
	buyer.mustDo(`{ me { id } }`, nil, &me)
	if me.Me.ID != buyerAuth.User.ID {
		t.Fatalf("new token: me = %+v", me)
	}

	// ── Admin revoke ──────────────────────────────────────────────────────────
	st := store.New(pool)
	if _, err := st.SetAdminRole(ctx, adminEmail, true); err != nil {
		t.Fatal(err)
	}
	var lg struct{ Login authPayload }
	(&gqlClient{t: t, url: url}).mustDo(`mutation($in: LoginInput!) { login(input: $in) { `+authFields+` } }`,
		map[string]any{"in": map[string]any{"email": adminEmail, "password": "correct-horse-battery"}}, &lg)
	admin.token = lg.Login.AccessToken
	userQ := `query($s: String) { adminUsers(search: $s) { nodes { id email } } }`
	var found struct {
		AdminUsers struct{ Nodes []struct{ ID, Email string } }
	}
	admin.mustDo(userQ, map[string]any{"s": buyerEmail}, &found)
	if len(found.AdminUsers.Nodes) != 1 || found.AdminUsers.Nodes[0].Email != buyerEmail {
		t.Fatalf("admin should find the buyer: %+v", found)
	}
	if _, err := st.SetAdminRole(ctx, adminEmail, false); err != nil {
		t.Fatal(err)
	}
	admin.expectCode(graph.CodeUnauthenticated, userQ, map[string]any{"s": buyerEmail})
	admin.expectCode(graph.CodeUnauthenticated, `{ me { id } }`, nil)
}
