package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOpNamerLabel(t *testing.T) {
	o := NewOpNamer(2)
	tests := []struct{ in, want string }{
		{"", Anonymous},
		{"Coffees", "Coffees"},
		{"Coffees", "Coffees"}, // already tracked
		{"Login", "Login"},
		{"Third", Other}, // cap of 2 distinct names reached
		{"Coffees", "Coffees"},
		{"has space", Other},
		{"drop;table", Other},
		{"1starts_with_digit", Other},
		{"日本語", Other},
		{strings.Repeat("a", MaxOperationNameLen+1), Other},
	}
	for _, tc := range tests {
		if got := o.Label(tc.in); got != tc.want {
			t.Errorf("Label(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	// The longest allowed name is still accepted by a fresh namer.
	long := strings.Repeat("a", MaxOperationNameLen)
	if got := NewOpNamer(5).Label(long); got != long {
		t.Errorf("a %d-character name should be kept", MaxOperationNameLen)
	}
}

func TestRoute(t *testing.T) {
	tests := []struct{ path, want string }{
		{"/graphql", "graphql"},
		{"/health", "health"},
		{"/health/live", "health"},
		{"/health/ready", "health"},
		{"/playground", "playground"},
		{"/random-" + "attacker-path", Other},
		{"/graphql/extra", Other},
	}
	for _, tc := range tests {
		if got := Route(tc.path); got != tc.want {
			t.Errorf("Route(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}
}

func scrape(t *testing.T, m *Metrics) string {
	t.Helper()
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("scrape status %d", rec.Code)
	}
	return rec.Body.String()
}

func TestRecordedSeriesAppear(t *testing.T) {
	m := New()
	m.ObserveOperation("Coffees", StatusOK, 20*time.Millisecond)
	m.ObserveOperation("evil name!", StatusServerError, time.Second)
	m.RateLimitRejected("login_ip")()
	m.ObserveSweep("media_cleanup", "ok", 3)
	m.ObserveSweep("media_cleanup", "skipped", 0)

	h := m.HTTPMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/graphql", nil))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/unknown/"+"path/with/id-123", nil))

	out := scrape(t, m)
	for _, want := range []string{
		`moni_graphql_operation_duration_seconds_count{operation="Coffees",status="ok"} 1`,
		`moni_graphql_operation_duration_seconds_count{operation="other",status="server_error"} 1`,
		`moni_rate_limit_rejections_total{bucket="login_ip"} 1`,
		`moni_sweep_runs_total{job="media_cleanup",outcome="ok"} 1`,
		`moni_sweep_runs_total{job="media_cleanup",outcome="skipped"} 1`,
		`moni_sweep_deleted_total{job="media_cleanup"} 3`,
		`moni_http_requests_total{route="graphql",status="429"} 1`,
		`moni_http_requests_total{route="other",status="429"} 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("scrape is missing %s", want)
		}
	}
	if strings.Contains(out, "id-123") || strings.Contains(out, "evil name") {
		t.Error("client-supplied strings must not become label values")
	}
}
