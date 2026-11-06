package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

func TestAccessLevel(t *testing.T) {
	tests := []struct {
		path   string
		status int
		want   slog.Level
	}{
		{"/graphql", 200, slog.LevelInfo},
		{"/graphql", 304, slog.LevelInfo},
		{"/graphql", 401, slog.LevelWarn},
		{"/graphql", 429, slog.LevelWarn},
		{"/graphql", 500, slog.LevelError},
		{"/health", 200, slog.LevelDebug},
		{"/health", 503, slog.LevelError},
		{"/healthz", 200, slog.LevelInfo},
	}
	for _, tc := range tests {
		if got := accessLevel(tc.path, tc.status); got != tc.want {
			t.Errorf("accessLevel(%q, %d) = %v, want %v", tc.path, tc.status, got, tc.want)
		}
	}
}

func TestAccessLog(t *testing.T) {
	proxies, _ := ParsePrefixes("10.0.0.0/8")
	tests := []struct {
		name      string
		target    string
		handler   http.HandlerFunc
		wantLog   bool
		wantLevel string
		wantCode  int
		wantBytes int
	}{
		{"ok", "/graphql?token=secret", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hello")) }, true, "INFO", 200, 5},
		{"implicit 200", "/graphql", func(http.ResponseWriter, *http.Request) {}, true, "INFO", 200, 0},
		{"client error", "/graphql", func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "no", http.StatusTooManyRequests) }, true, "WARN", 429, 3},
		{"server error", "/graphql", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) }, true, "ERROR", 502, 0},
		{"health hidden at info", "/health", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) }, false, "", 0, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
			h := chimiddleware.RequestID(ClientIPMiddleware(proxies)(AccessLog(logger)(tc.handler)))

			req := httptest.NewRequest(http.MethodPost, tc.target, nil)
			req.RemoteAddr = "10.1.2.3:5555"
			req.Header.Set("X-Forwarded-For", "203.0.113.9")
			h.ServeHTTP(httptest.NewRecorder(), req)

			if !tc.wantLog {
				if buf.Len() != 0 {
					t.Fatalf("expected no log line, got %s", buf.String())
				}
				return
			}
			var rec map[string]any
			if err := json.Unmarshal(buf.Bytes(), &rec); err != nil {
				t.Fatalf("not one JSON record: %v (%q)", err, buf.String())
			}
			checks := map[string]any{
				"level": tc.wantLevel, "msg": "http request", "method": "POST", "path": "/graphql",
				"status": float64(tc.wantCode), "bytes": float64(tc.wantBytes), "client_ip": "203.0.113.9",
			}
			for k, want := range checks {
				if rec[k] != want {
					t.Errorf("%s = %v, want %v", k, rec[k], want)
				}
			}
			if id, _ := rec["request_id"].(string); id == "" {
				t.Error("request_id missing")
			}
			if _, ok := rec["duration_ms"].(float64); !ok {
				t.Error("duration_ms missing")
			}
		})
	}
}
