package middleware

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
		code    int
	}{
		{"ok", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"data":{}}`)) }, 200},
		{"error", func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "database unavailable", 503) }, 503},
		{"no body", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }, 204},
		{"json", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
		}, 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			SecurityHeaders(tc.handler).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graphql", nil))
			if rec.Code != tc.code {
				t.Errorf("code = %d, want %d", rec.Code, tc.code)
			}
			if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
			}
		})
	}
}

// A panic is answered by Recover; the header set before it must survive.
func TestSecurityHeadersOnPanic(t *testing.T) {
	rec := httptest.NewRecorder()
	h := SecurityHeaders(Recover(slog.New(slog.DiscardHandler))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })))
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != 500 || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("got %d, nosniff %q", rec.Code, rec.Header().Get("X-Content-Type-Options"))
	}
}
