package middleware

import "net/http"

// SecurityHeaders sets headers every API response should carry, before the
// handler runs (so error and panic responses get them too).
// X-Content-Type-Options: nosniff stops browsers from guessing a JSON or
// plain-text response is HTML or script.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}
