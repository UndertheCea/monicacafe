package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/errreport"
)

func passthrough(next http.Handler) http.Handler { return next }

func testRouter(playground bool) http.Handler {
	return newRouterWith(playground, passthrough)
}

func newRouterWith(playground bool, loaders func(http.Handler) http.Handler) http.Handler {
	return newRouter(routerDeps{
		Metrics:     passthrough,
		OnPanic:     func() {},
		Reporter:    errreport.Noop{},
		CORSOrigins: []string{"https://moni.example"},
		Ready:       http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
		// Stands in for gqlgen: reads the whole body like it does.
		GraphQL: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, err := io.Copy(io.Discard, r.Body); err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					http.Error(w, "too large", http.StatusRequestEntityTooLarge)
					return
				}
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
		}),
		GraphQLIP:  passthrough,
		Auth:       passthrough,
		Loaders:    loaders,
		Playground: playground,
	})
}

func TestRouter(t *testing.T) {
	big := strings.Repeat("x", graph.MaxRequestBytes+1)
	tests := []struct {
		name       string
		playground bool
		method     string
		path       string
		body       string
		header     map[string]string
		wantStatus int
		wantHeader map[string]string // "" means absent
	}{
		{name: "live", playground: true, method: "GET", path: "/health/live", wantStatus: 200,
			wantHeader: map[string]string{"X-Content-Type-Options": "nosniff"}},
		{name: "ready", method: "GET", path: "/health/ready", wantStatus: 200},
		{name: "health alias", method: "GET", path: "/health", wantStatus: 200},
		{name: "unknown path 404 keeps security headers", method: "GET", path: "/nope", wantStatus: 404,
			wantHeader: map[string]string{"X-Content-Type-Options": "nosniff"}},
		{name: "metrics not on public router", method: "GET", path: "/metrics", wantStatus: 404},
		{name: "playground in development", playground: true, method: "GET", path: "/playground", wantStatus: 200},
		{name: "playground hidden in production", method: "GET", path: "/playground", wantStatus: 404},
		{name: "cors allowed origin", method: "OPTIONS", path: "/graphql", wantStatus: 200,
			header:     map[string]string{"Origin": "https://moni.example", "Access-Control-Request-Method": "POST"},
			wantHeader: map[string]string{"Access-Control-Allow-Origin": "https://moni.example"}},
		{name: "cors other origin", method: "OPTIONS", path: "/graphql", wantStatus: 200,
			header:     map[string]string{"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
			wantHeader: map[string]string{"Access-Control-Allow-Origin": ""}},
		{name: "graphql small body", method: "POST", path: "/graphql", body: `{"query":"{a}"}`, wantStatus: 200},
		{name: "graphql oversized body refused", method: "POST", path: "/graphql", body: big, wantStatus: 413},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			for k, v := range tc.header {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			testRouter(tc.playground).ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			for k, v := range tc.wantHeader {
				if got := rec.Header().Get(k); got != v {
					t.Errorf("header %s = %q, want %q", k, got, v)
				}
			}
		})
	}
}

// The chain puts the request id in the context (for logs and error reports);
// it does not echo it in a response header. A sane incoming id is kept, a
// malformed one is replaced.
func TestRouterRequestID(t *testing.T) {
	tests := []struct {
		name, in string
		wantKept bool
	}{
		{"sane id kept", "abc-123", true},
		{"malformed id replaced", "bad id\twith spaces", false},
		{"no id generates one", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			h := newRouterWith(false, func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					got = chimiddleware.GetReqID(r.Context())
					next.ServeHTTP(w, r)
				})
			})
			req := httptest.NewRequest("POST", "/graphql", strings.NewReader("{}"))
			if tc.in != "" {
				req.Header.Set("X-Request-Id", tc.in)
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			if got == "" {
				t.Fatal("no request id in context")
			}
			if (got == tc.in) != tc.wantKept {
				t.Errorf("id = %q (incoming %q), kept=%v want %v", got, tc.in, got == tc.in, tc.wantKept)
			}
		})
	}
}
