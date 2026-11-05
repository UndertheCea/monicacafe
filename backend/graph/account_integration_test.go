package graph_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// TestAccount: updateProfile renames the viewer; changePassword checks the
// current password, revokes every other session and returns working tokens.
// Requires TEST_DATABASE_URL.
func TestAccount(t *testing.T) {
	url, _ := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits = graph.Limits{PasswordUser: ratelimit.New(ratelimit.Rule{Burst: 4, Per: time.Hour})}
	})
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	email := "account+" + run + "@example.com"
	c, first := register(t, url, email)
	anon := &gqlClient{t: t, url: url}

	// Profile.
	const update = `mutation($in: UpdateProfileInput!) { updateProfile(input: $in) { displayName email } }`
	var up struct {
		UpdateProfile struct {
			DisplayName string
			Email       *string
		}
	}
	c.mustDo(update, map[string]any{"in": map[string]any{"displayName": "  新名字  "}}, &up)
	if up.UpdateProfile.DisplayName != "新名字" || up.UpdateProfile.Email == nil || *up.UpdateProfile.Email != email {
		t.Fatalf("updateProfile = %+v", up.UpdateProfile)
	}
	c.expectCode("BAD_USER_INPUT", update, map[string]any{"in": map[string]any{"displayName": " "}})
	anon.expectCode("UNAUTHENTICATED", update, map[string]any{"in": map[string]any{"displayName": "x"}})

	// A second session that must not survive the password change.
	const login = `mutation($in: LoginInput!) { login(input: $in) { refreshToken } }`
	var other struct{ Login struct{ RefreshToken string } }
	anon.mustDo(login, map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}}, &other)

	const change = `mutation($in: ChangePasswordInput!) { changePassword(input: $in) { ` + authFields + ` } }`
	c.expectCode("BAD_USER_INPUT", change, map[string]any{"in": map[string]any{"currentPassword": "wrong-password-1", "newPassword": "new-password-2"}})
	c.expectCode("BAD_USER_INPUT", change, map[string]any{"in": map[string]any{"currentPassword": "correct-horse-battery", "newPassword": "short"}})
	var changed struct{ ChangePassword authPayload }
	c.mustDo(change, map[string]any{"in": map[string]any{"currentPassword": "correct-horse-battery", "newPassword": "new-password-2"}}, &changed)
	if changed.ChangePassword.AccessToken == "" || changed.ChangePassword.RefreshToken == "" {
		t.Fatal("changePassword returned no tokens")
	}

	const refresh = `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": first.RefreshToken})
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": other.Login.RefreshToken})
	anon.mustDo(refresh, map[string]any{"t": changed.ChangePassword.RefreshToken}, nil)
	anon.expectCode("UNAUTHENTICATED", login, map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}})
	anon.mustDo(login, map[string]any{"in": map[string]any{"email": email, "password": "new-password-2"}}, nil)

	// 4th attempt this hour is the last allowed; the 5th is rate limited.
	c.token = changed.ChangePassword.AccessToken
	c.expectCode("BAD_USER_INPUT", change, map[string]any{"in": map[string]any{"currentPassword": "wrong-password-1", "newPassword": "new-password-3"}})
	c.expectCode("RATE_LIMITED", change, map[string]any{"in": map[string]any{"currentPassword": "new-password-2", "newPassword": "new-password-3"}})
}
