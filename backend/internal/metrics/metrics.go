// Package metrics exposes Prometheus metrics on a separate, internal listener
// (#221). Label cardinality is bounded everywhere: GraphQL operation names are
// client-supplied, so they pass through OpNamer; routes and statuses come from
// fixed sets.
package metrics

import (
	"net/http"
	"regexp"
	"strconv"
	"sync"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Operation statuses (GraphQL responses are HTTP 200 even when they fail, so
// the status is derived from the error codes).
const (
	StatusOK          = "ok"
	StatusClientError = "client_error"
	StatusServerError = "server_error"
)

// Other is the label for operation names we refuse to track.
const Other = "other"

// Anonymous is the label for operations without a name.
const Anonymous = "anonymous"

// MaxOperationNameLen and MaxOperationNames bound the operation label: a name
// must be a short GraphQL identifier, and only the first MaxOperationNames
// distinct names are tracked (the frontend has about 60 operations).
const (
	MaxOperationNameLen = 64
	MaxOperationNames   = 100
)

var nameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// OpNamer maps client-supplied operation names to a bounded label set.
type OpNamer struct {
	mu   sync.Mutex
	seen map[string]struct{}
	max  int
}

// NewOpNamer tracks at most max distinct names.
func NewOpNamer(max int) *OpNamer { return &OpNamer{seen: map[string]struct{}{}, max: max} }

// Label returns the label for name: "anonymous" when empty, "other" when it is
// not a short identifier or when max distinct names are already tracked.
func (o *OpNamer) Label(name string) string {
	switch {
	case name == "":
		return Anonymous
	case len(name) > MaxOperationNameLen || !nameRe.MatchString(name):
		return Other
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	if _, ok := o.seen[name]; ok {
		return name
	}
	if len(o.seen) >= o.max {
		return Other
	}
	o.seen[name] = struct{}{}
	return name
}

// Route is the bounded route label for a request path.
func Route(path string) string {
	switch path {
	case "/graphql":
		return "graphql"
	case "/health", "/health/live", "/health/ready":
		return "health"
	case "/playground":
		return "playground"
	}
	return Other
}

// Metrics owns the registry and every collector.
type Metrics struct {
	Registry *prometheus.Registry

	ops           *OpNamer
	httpRequests  *prometheus.CounterVec
	httpDuration  *prometheus.HistogramVec
	gqlDuration   *prometheus.HistogramVec
	rateLimited   *prometheus.CounterVec
	sweepRuns     *prometheus.CounterVec
	sweepDeleted  *prometheus.CounterVec
	httpInFlight  prometheus.Gauge
	panicsCounter prometheus.Counter
}

var durationBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}

// New builds a registry with the Go runtime and process collectors plus ours.
func New() *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	m := &Metrics{
		Registry: reg,
		ops:      NewOpNamer(MaxOperationNames),
		httpRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "moni_http_requests_total", Help: "HTTP requests by route and status code.",
		}, []string{"route", "status"}),
		httpDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "moni_http_request_duration_seconds", Help: "HTTP request duration by route.", Buckets: durationBuckets,
		}, []string{"route"}),
		gqlDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "moni_graphql_operation_duration_seconds",
			Help:    "GraphQL operation duration by operation name and status; the _count series is the request count.",
			Buckets: durationBuckets,
		}, []string{"operation", "status"}),
		rateLimited: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "moni_rate_limit_rejections_total", Help: "Requests refused by a rate limiter, by bucket.",
		}, []string{"bucket"}),
		sweepRuns: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "moni_sweep_runs_total", Help: "Background sweep runs by job and outcome (ok, error, skipped).",
		}, []string{"job", "outcome"}),
		sweepDeleted: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "moni_sweep_deleted_total", Help: "Rows or objects deleted by background sweeps, by job.",
		}, []string{"job"}),
		httpInFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "moni_http_requests_in_flight", Help: "HTTP requests being served.",
		}),
		panicsCounter: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "moni_panics_total", Help: "Panics recovered in HTTP handlers.",
		}),
	}
	reg.MustRegister(m.httpRequests, m.httpDuration, m.gqlDuration, m.rateLimited, m.sweepRuns, m.sweepDeleted,
		m.httpInFlight, m.panicsCounter)
	return m
}

// Handler serves the registry in the Prometheus text format.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.Registry, promhttp.HandlerOpts{})
}

// RateLimitRejected returns a function that counts one rejection for bucket;
// pass it to ratelimit.Limiter.OnReject.
func (m *Metrics) RateLimitRejected(bucket string) func() {
	c := m.rateLimited.WithLabelValues(bucket)
	return c.Inc
}

// Panic counts one recovered panic.
func (m *Metrics) Panic() { m.panicsCounter.Inc() }

// ObserveSweep records one run of a background job. outcome is "ok", "error"
// or "skipped" (another instance held the lock); deleted may be zero.
func (m *Metrics) ObserveSweep(job, outcome string, deleted int) {
	m.sweepRuns.WithLabelValues(job, outcome).Inc()
	if deleted > 0 {
		m.sweepDeleted.WithLabelValues(job).Add(float64(deleted))
	}
}

// ObserveOperation records one GraphQL operation (graph.Observer).
func (m *Metrics) ObserveOperation(name, status string, d time.Duration) {
	m.gqlDuration.WithLabelValues(m.ops.Label(name), status).Observe(d.Seconds())
}

// HTTPMiddleware counts and times every request by route and status code.
// Mount it outside Recover so a recovered panic is counted as the 500 it became.
func (m *Metrics) HTTPMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			m.httpInFlight.Inc()
			defer func() {
				m.httpInFlight.Dec()
				status := ww.Status()
				if status == 0 {
					status = http.StatusOK
				}
				route := Route(r.URL.Path)
				m.httpRequests.WithLabelValues(route, strconv.Itoa(status)).Inc()
				m.httpDuration.WithLabelValues(route).Observe(time.Since(start).Seconds())
			}()
			next.ServeHTTP(ww, r)
		})
	}
}

// RegisterPool exposes the pgx pool's statistics, read when scraped.
func (m *Metrics) RegisterPool(pool *pgxpool.Pool) {
	gauge := func(name, help string, f func(*pgxpool.Stat) float64) {
		m.Registry.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: name, Help: help},
			func() float64 { return f(pool.Stat()) }))
	}
	counter := func(name, help string, f func(*pgxpool.Stat) float64) {
		m.Registry.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{Name: name, Help: help},
			func() float64 { return f(pool.Stat()) }))
	}
	gauge("moni_db_pool_connections_max", "Maximum open connections.", func(s *pgxpool.Stat) float64 { return float64(s.MaxConns()) })
	gauge("moni_db_pool_connections_total", "Open connections (idle + in use).", func(s *pgxpool.Stat) float64 { return float64(s.TotalConns()) })
	gauge("moni_db_pool_connections_idle", "Idle connections.", func(s *pgxpool.Stat) float64 { return float64(s.IdleConns()) })
	gauge("moni_db_pool_connections_acquired", "Connections in use.", func(s *pgxpool.Stat) float64 { return float64(s.AcquiredConns()) })
	counter("moni_db_pool_acquires_total", "Connection acquisitions.", func(s *pgxpool.Stat) float64 { return float64(s.AcquireCount()) })
	counter("moni_db_pool_empty_acquires_total", "Acquisitions that had to wait because the pool was exhausted.", func(s *pgxpool.Stat) float64 { return float64(s.EmptyAcquireCount()) })
	counter("moni_db_pool_canceled_acquires_total", "Acquisitions cancelled while waiting.", func(s *pgxpool.Stat) float64 { return float64(s.CanceledAcquireCount()) })
	counter("moni_db_pool_acquire_seconds_total", "Total time spent acquiring connections.", func(s *pgxpool.Stat) float64 { return s.AcquireDuration().Seconds() })
}
