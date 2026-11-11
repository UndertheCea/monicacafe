package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
	"golang.org/x/crypto/bcrypt"
)

// TestLoginLockout (#213): failed passwords from one address can't lock the
// owner out from another; only failures count, the account-wide ceiling
// still holds across addresses, and an IPv6 /64 counts as one address.
// Requires TEST_DATABASE_URL.
func TestLoginLockout(t *testing.T) {
	url, _ := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{
			LoginEmail:   ratelimit.New(ratelimit.Rule{Burst: 5, Per: time.Hour}),
			LoginEmailIP: ratelimit.New(ratelimit.Rule{Burst: 2, Per: time.Hour}),
		}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	email := "lockout+" + run + "@example.com"
	register(t, url, email)
	const login = `mutation($in: LoginInput!) { login(input: $in) { accessToken } }`
	wrong := map[string]any{"in": map[string]any{"email": email, "password": "wrong-password-123"}}
	right := map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}}
	from := func(ip string) *gqlClient { return &gqlClient{t: t, url: url, ip: ip} }

	steps := []struct {
		name, ip string
		vars     map[string]any
		want     string // "" = success
	}{
		{"successes don't spend tokens", "198.51.100.1", right, ""},
		{"", "198.51.100.1", right, ""},
		{"", "198.51.100.1", right, ""},
		{"attacker fails once", "203.0.113.9", wrong, "UNAUTHENTICATED"},
		{"attacker fails twice", "203.0.113.9", wrong, "UNAUTHENTICATED"},
		{"attacker's address is now limited", "203.0.113.9", wrong, "RATE_LIMITED"},
		{"even with the right password", "203.0.113.9", right, "RATE_LIMITED"},
		{"the owner elsewhere still gets in", "198.51.100.1", right, ""},
		{"IPv6 attacker fails", "2001:db8:1:2::1", wrong, "UNAUTHENTICATED"},
		{"same /64, other host", "2001:db8:1:2::ffff", wrong, "UNAUTHENTICATED"},
		{"the /64 is limited", "2001:db8:1:2:abcd::1", wrong, "RATE_LIMITED"},
		{"fifth failure overall", "192.0.2.50", wrong, "UNAUTHENTICATED"},
		{"account-wide ceiling reached", "192.0.2.51", right, "RATE_LIMITED"},
	}
	for i, s := range steps {
		c := from(s.ip)
		r := c.do(login, s.vars, nil)
		got := ""
		if len(r.Errors) > 0 {
			got, _ = r.Errors[0].Extensions["code"].(string)
		}
		if got != s.want {
			t.Fatalf("step %d (%s from %s): got %q, want %q", i, s.name, s.ip, got, s.want)
		}
	}
}

// TestPasswordPolicy (#213): common passwords are refused for new accounts
// and password changes, and a hash made at an older bcrypt cost is upgraded
// on the next login. Requires TEST_DATABASE_URL.
func TestPasswordPolicy(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	const reg = `mutation($in: RegisterInput!) { register(input: $in) { accessToken } }`
	r := anon.do(reg, map[string]any{"in": map[string]any{"email": "common+" + run + "@example.com", "password": "Password", "displayName": "x"}}, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput || r.Errors[0].Extensions["field"] != "password" {
		t.Fatalf("common password at register: %+v", r.Errors)
	}

	email := "rehash+" + run + "@example.com"
	c, _ := register(t, url, email)
	c.expectCode(graph.CodeBadInput, `mutation { changePassword(input: {currentPassword: "correct-horse-battery", newPassword: "iloveyou"}) { accessToken } }`, nil)

	ctx := context.Background()
	old, _ := bcrypt.GenerateFromPassword([]byte("correct-horse-battery"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE email = $1`, email, string(old)); err != nil {
		t.Fatal(err)
	}
	anon.mustDo(`mutation($in: LoginInput!) { login(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}}, nil)
	var hash string
	if err := pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE email = $1`, email).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if cost, _ := bcrypt.Cost([]byte(hash)); cost != 12 {
		t.Fatalf("after login the hash cost is %d, want 12", cost)
	}
}

// TestSellerWriteLimitAndCoffeeCap (#213): seller mutations share one bucket
// per account, and a shop can't go past MaxCoffeesPerShop coffees.
// Requires TEST_DATABASE_URL.
func TestSellerWriteLimitAndCoffeeCap(t *testing.T) {
	url, pool := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{SellerWriteUser: ratelimit.New(ratelimit.Rule{Burst: 3, Per: time.Hour})}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "sw+"+run+"@example.com")
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`, // token 1
		map[string]any{"in": map[string]any{"slug": "sw-" + run, "name": "SW", "description": "", "city": "台北市"}}, &shop)
	upd := `mutation($id: ID!) { updateShop(id: $id, input: {description: "x"}) { id } }`
	seller.mustDo(upd, map[string]any{"id": shop.CreateShop.ID}, nil) // 2
	seller.mustDo(upd, map[string]any{"id": shop.CreateShop.ID}, nil) // 3
	seller.expectCode(graph.CodeRateLimited, upd, map[string]any{"id": shop.CreateShop.ID})

	// The cap: fill the shop to the limit straight in the database, then
	// duplicate one of them through the API (no rate limit on this server).
	url2, _ := newTestServer(t)
	seller.url = url2
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `
		INSERT INTO coffees (shop_id, name, slug, origin_country_id, processing_method_id)
		SELECT $1, 'cap', 'cap-' || gen_random_uuid(),
			(SELECT id FROM origin_countries ORDER BY id LIMIT 1),
			(SELECT id FROM processing_methods ORDER BY id LIMIT 1)
		FROM generate_series(1, $2)`, shop.CreateShop.ID, graph.MaxCoffeesPerShop); err != nil {
		t.Fatal(err)
	}
	var any1 string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1 LIMIT 1`, shop.CreateShop.ID).Scan(&any1); err != nil {
		t.Fatal(err)
	}
	seller.expectCode(graph.CodeLimitReached, `mutation($id: ID!) { duplicateCoffee(id: $id) { id } }`, map[string]any{"id": any1})
	if _, err := pool.Exec(ctx, `DELETE FROM coffees WHERE id = $1`, any1); err != nil {
		t.Fatal(err)
	}
	var other string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1 LIMIT 1`, shop.CreateShop.ID).Scan(&other); err != nil {
		t.Fatal(err)
	}
	seller.mustDo(`mutation($id: ID!) { duplicateCoffee(id: $id) { id } }`, map[string]any{"id": other}, nil)
}
