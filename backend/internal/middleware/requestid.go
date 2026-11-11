package middleware

import "net/http"

// maxRequestIDLen bounds an incoming X-Request-ID that we are willing to reuse.
const maxRequestIDLen = 64

// validRequestID reports whether id is a sane correlation id: 1-64 characters
// of [A-Za-z0-9._-]. Anything else (control characters, spaces, log-injection
// attempts, huge values) is not worth echoing into logs.
func validRequestID(id string) bool {
	if id == "" || len(id) > maxRequestIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '_', c == '.':
		default:
			return false
		}
	}
	return true
}

// SanitizeRequestID drops an incoming X-Request-ID that isn't a sane id, so
// chi's RequestID (which reuses the header as-is) generates a fresh one
// instead. Put it before chimiddleware.RequestID. nginx sends $request_id
// (#214), so one id follows a request through nginx and the API logs.
func SanitizeRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id := r.Header.Get("X-Request-ID"); id != "" && !validRequestID(id) {
			r.Header.Del("X-Request-ID")
		}
		next.ServeHTTP(w, r)
	})
}
