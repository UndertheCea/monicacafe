package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// TestAuthRateLimits: once a bucket is empty the next login / register /
// refresh is refused with RATE_LIMITED and a retryAfter hint, before any
// password is checked. Requires TEST_DATABASE_URL.
func TestAuthRateLimits(t *testing.T) {
	const loginsPerEmail = 3
	url, _ := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{
			LoginEmail: ratelimit.New(ratelimit.Rule{Burst: loginsPerEmail, Per: time.Hour}),
			RegisterIP: ratelimit.New(ratelimit.Rule{Burst: 2, Per: time.Hour}),
			RefreshIP:  ratelimit.New(ratelimit.Rule{Burst: 1, Per: time.Hour}),
		}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	email := "limited+" + run + "@example.com"
	_, reg := register(t, url, email) // register token 1 of 2
	anon := &gqlClient{t: t, url: url}

	const login = `mutation($in: LoginInput!) { login(input: $in) { accessToken } }`
	wrong := map[string]any{"in": map[string]any{"email": email, "password": "wrong-password-123"}}
	for range loginsPerEmail {
		anon.expectCode("UNAUTHENTICATED", login, wrong) // attempts 1..N are checked normally
	}
	// N+1: refused even with the right password (and case-folded email).
	right := map[string]any{"in": map[string]any{"email": "  LIMITED+" + run + "@EXAMPLE.com", "password": "correct-horse-battery"}}
	r := anon.do(login, right, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != "RATE_LIMITED" {
		t.Fatalf("login %d: want RATE_LIMITED, got %+v", loginsPerEmail+1, r.Errors)
	}
	if ra, _ := r.Errors[0].Extensions["retryAfter"].(float64); ra < 1 {
		t.Fatalf("retryAfter = %v, want ≥ 1", r.Errors[0].Extensions["retryAfter"])
	}
	// Another account's budget is untouched.
	anon.expectCode("UNAUTHENTICATED", login, map[string]any{"in": map[string]any{"email": "other+" + run + "@example.com", "password": "nope-nope-nope"}})

	// Register: second succeeds, third is refused for this IP.
	register(t, url, "limited2+"+run+"@example.com")
	anon.expectCode("RATE_LIMITED", `mutation($in: RegisterInput!) { register(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "limited3+" + run + "@example.com", "password": "correct-horse-battery", "displayName": "x"}})

	// Refresh: one per hour here.
	const refresh = `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`
	anon.mustDo(refresh, map[string]any{"t": reg.RefreshToken}, nil)
	anon.expectCode("RATE_LIMITED", refresh, map[string]any{"t": reg.RefreshToken})
}
