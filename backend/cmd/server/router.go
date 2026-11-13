package main

import (
	"log/slog"
	"net/http"
	"net/netip"

	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/errreport"
	"github.com/underthecea/monicacafe/backend/internal/health"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
)

// routerDeps is everything the public API router needs. The middleware and
// handlers are plain functions so tests can pass fakes instead of a database.
type routerDeps struct {
	Proxies     []netip.Prefix
	Metrics     func(http.Handler) http.Handler // metrics.HTTPMiddleware
	OnPanic     func()                          // counts a recovered panic
	Reporter    errreport.Reporter
	CORSOrigins []string
	Ready       http.Handler // /health and /health/ready
	GraphQL     http.Handler
	GraphQLIP   func(http.Handler) http.Handler // per-IP rate limit
	Auth        func(http.Handler) http.Handler
	Loaders     func(http.Handler) http.Handler
	Playground  bool // serve /playground (not in production)
}

// newRouter assembles the public API; the middleware order matters (see the
// comments).
func newRouter(d routerDeps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.SanitizeRequestID)
	r.Use(chimiddleware.RequestID)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.ClientIPMiddleware(d.Proxies))
	r.Use(d.Metrics) // outside Recover: a recovered panic counts as its 500
	r.Use(middleware.AccessLog(slog.Default()))
	r.Use(middleware.Recover(slog.Default(), func(r *http.Request, rec any, stack []byte) {
		d.OnPanic()
		d.Reporter.Report(errreport.Event{Kind: "panic", Message: middleware.PanicText(rec), Stack: string(stack),
			Method: r.Method, Path: r.URL.Path, RequestID: chimiddleware.GetReqID(r.Context())})
	}))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   d.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health/live", health.Live)
	r.Get("/health/ready", d.Ready.ServeHTTP)
	r.Get("/health", d.Ready.ServeHTTP) // alias, kept for existing probes

	r.Group(func(r chi.Router) {
		// First, so a throttled address costs no token check or database work.
		r.Use(d.GraphQLIP)
		r.Use(d.Auth)
		r.Use(d.Loaders)
		r.Use(chimiddleware.RequestSize(graph.MaxRequestBytes))
		r.Handle("/graphql", d.GraphQL)
	})
	if d.Playground {
		r.Handle("/playground", playground.Handler("Moni Cafe API", "/graphql"))
	}
	return r
}
