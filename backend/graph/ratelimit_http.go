package graph

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// IPRateLimit throttles every request to the wrapped handler per client IP
// (#207). The per-mutation limits only cover sign-in and a few writes; this
// one also covers plain queries, so one address can't keep the database pool
// busy. A refused request gets HTTP 429 with the usual error shape
// (RATE_LIMITED + retryAfter) and a Retry-After header. A nil limiter allows
// everything. It must run after middleware.ClientIPMiddleware.
func IPRateLimit(l *ratelimit.Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if l == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok, retry := l.Allow(ratelimit.IPKey(middleware.ClientIPFrom(r.Context())))
			if ok {
				next.ServeHTTP(w, r)
				return
			}
			secs := max(int((retry+time.Second-1)/time.Second), 1)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(secs))
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"errors": []map[string]any{{
					"message":    "too many requests, try again later",
					"extensions": map[string]any{"code": CodeRateLimited, "retryAfter": secs},
				}},
				"data": nil,
			})
		})
	}
}
