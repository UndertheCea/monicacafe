package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

func TestSanitizeRequestID(t *testing.T) {
	tests := []struct {
		name   string
		header string
		reuse  bool
	}{
		{"none", "", false},
		{"nginx hex", "a3f9c2d41b7e4f0a9c6d5e8b1a2f3c4d", true},
		{"uuid", "123e4567-e89b-12d3-a456-426614174000", true},
		{"dots underscores", "req_1.2-3", true},
		{"max length", strings.Repeat("a", 64), true},
		{"too long", strings.Repeat("a", 65), false},
		{"space", "a b", false},
		{"newline", "abc\ndef", false},
		{"quote", `a"b`, false},
		{"non-ascii", "咖啡", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			h := SanitizeRequestID(chimiddleware.RequestID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				got = chimiddleware.GetReqID(r.Context())
			})))
			req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
			if tc.header != "" {
				req.Header["X-Request-Id"] = []string{tc.header}
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			if tc.reuse && got != tc.header {
				t.Errorf("request id = %q, want the incoming %q", got, tc.header)
			}
			if !tc.reuse && (got == "" || got == tc.header) {
				t.Errorf("request id = %q, want a fresh one (incoming %q)", got, tc.header)
			}
		})
	}
}
