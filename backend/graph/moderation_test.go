package graph

import (
	"testing"

	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

func TestTokenCurrent(t *testing.T) {
	cases := []struct {
		name   string
		claims auth.Claims
		state  store.TokenState
		want   bool
	}{
		{"same version", auth.Claims{TokenVersion: 2, Role: "BUYER"}, store.TokenState{Version: 2, Role: "BUYER"}, true},
		{"token from before the column existed", auth.Claims{}, store.TokenState{Role: "BUYER"}, true},
		{"version bumped (password, sign out everywhere)", auth.Claims{TokenVersion: 1}, store.TokenState{Version: 2}, false},
		{"token ahead of the database", auth.Claims{TokenVersion: 3}, store.TokenState{Version: 2}, false},
		{"suspended", auth.Claims{TokenVersion: 2}, store.TokenState{Version: 2, Suspended: true}, false},
		{"promoted to seller by opening a shop", auth.Claims{Role: "BUYER"}, store.TokenState{Role: "SELLER"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tokenCurrent(&tc.claims, tc.state); got != tc.want {
				t.Fatalf("tokenCurrent = %v, want %v", got, tc.want)
			}
		})
	}
}
