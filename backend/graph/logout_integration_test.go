package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestLogoutSessions: logout(refreshToken) ends only that device's session and
// needs no access token; a late replay of the token rotated into the ended
// session is refused without ending the others; logoutEverywhere ends all.
// Requires TEST_DATABASE_URL.
func TestLogoutSessions(t *testing.T) {
	url, _ := newTestServer(t)
	email := fmt.Sprintf("logout+%d@example.com", time.Now().UnixNano())
	c, first := register(t, url, email)
	anon := &gqlClient{t: t, url: url}

	const login = `mutation($in: LoginInput!) { login(input: $in) { refreshToken } }`
	newSession := func() string {
		var out struct{ Login struct{ RefreshToken string } }
		anon.mustDo(login, map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery"}}, &out)
		return out.Login.RefreshToken
	}
	const refresh = `mutation($t: String!) { refreshToken(token: $t) { refreshToken } }`
	rotate := func(tok string) string {
		var out struct{ RefreshToken struct{ RefreshToken string } }
		anon.mustDo(refresh, map[string]any{"t": tok}, &out)
		return out.RefreshToken.RefreshToken
	}
	const logout = `mutation($t: String) { logout(refreshToken: $t) }`
	logoutOK := func(tok string) {
		var out struct{ Logout bool }
		anon.mustDo(logout, map[string]any{"t": tok}, &out)
		if !out.Logout {
			t.Fatalf("logout(%q) = false", tok)
		}
	}

	phone := newSession()
	laptop := newSession()

	// Signed out, single session: only the first device's token dies.
	logoutOK(first.RefreshToken)
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": first.RefreshToken})
	phone = rotate(phone)
	laptop = rotate(laptop)

	// Unknown, garbage and already-ended tokens are a no-op, not an error.
	logoutOK(first.RefreshToken)
	logoutOK("not-a-jwt")
	logoutOK("")

	// The phone's cookie lags a rotation (browser aborted the response) and
	// logs out with the stale token: the newer token dies too.
	stale := phone
	phone = rotate(phone)
	logoutOK(stale)
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": phone})

	// Log out with the newest token, then an aborted request replays its
	// predecessor inside the grace window: refused, but not treated as theft,
	// so the laptop keeps its session.
	prev := laptop
	laptop = rotate(laptop)
	tablet := newSession()
	logoutOK(laptop)
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": prev})
	tablet = rotate(tablet)

	// Without a token: needs sign-in and ends every session.
	anon.expectCode("UNAUTHENTICATED", `mutation { logout }`, nil)
	anon.expectCode("UNAUTHENTICATED", `mutation { logoutEverywhere }`, nil)
	other := newSession()
	var all struct{ LogoutEverywhere bool }
	c.mustDo(`mutation { logoutEverywhere }`, nil, &all)
	if !all.LogoutEverywhere {
		t.Fatal("logoutEverywhere = false")
	}
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": tablet})
	anon.expectCode("UNAUTHENTICATED", refresh, map[string]any{"t": other})
}
