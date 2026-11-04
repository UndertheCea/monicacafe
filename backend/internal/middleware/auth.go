package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/underthecea/monicacafe/backend/internal/auth"
)

type contextKey string

const userClaimsKey contextKey = "user_claims"

func Auth(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				next.ServeHTTP(w, r)
				return
			}
			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				next.ServeHTTP(w, r)
				return
			}
			claims, err := authSvc.ParseAccessToken(parts[1])
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			ctx := context.WithValue(r.Context(), userClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func ClaimsFromContext(ctx context.Context) *auth.Claims {
	c, _ := ctx.Value(userClaimsKey).(*auth.Claims)
	return c
}
