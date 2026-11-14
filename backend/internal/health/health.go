// Package health implements the liveness and readiness endpoints (#221).
//
//	/health/live   the process is up (no dependencies; use for restart decisions)
//	/health/ready  Postgres answers and the schema is at the version this build
//	               expects; the object store is reported but never fails readiness
//	/health        alias of /health/ready (what it always was: a database check)
package health

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// ExpectedMigration is the newest migrations/NNN_*.sql this build needs.
//
// It is a constant rather than something read at build time because the API's
// docker build context is ./backend, which can't see ../migrations; and a
// constant is greppable and reviewable in the same diff that adds a migration.
// TestExpectedMigrationIsNewest fails when the two drift apart, so CI catches
// a forgotten bump. Readiness asks whether *this* migration is recorded in
// schema_migrations (not whether it is the newest), so during a rolling deploy
// old instances stay ready against a database that is already ahead of them.
const ExpectedMigration = "022_cart"

// Status of one check.
type Status string

const (
	OK       Status = "ok"
	Fail     Status = "fail"
	Disabled Status = "disabled"
)

// Result is one named check. Required results fail readiness when not OK;
// the rest are informational.
type Result struct {
	Name     string
	Status   Status
	Required bool
}

// Ready is true when every required result is OK. No results means ready.
func Ready(results []Result) bool {
	for _, r := range results {
		if r.Required && r.Status != OK {
			return false
		}
	}
	return true
}

// Probe checks one dependency.
type Probe func(ctx context.Context) error

// ErrMigrationBehind means the database lacks the migration this build expects.
var ErrMigrationBehind = errors.New("health: expected migration is not recorded in schema_migrations")

// MigrationProbe reports whether version is recorded in schema_migrations. A
// missing table is an error from Postgres, which also means not ready.
func MigrationProbe(q func(ctx context.Context, version string) (bool, error), version string) Probe {
	return func(ctx context.Context) error {
		ok, err := q(ctx, version)
		if err != nil {
			return err
		}
		if !ok {
			return ErrMigrationBehind
		}
		return nil
	}
}

// Checker runs the probes. Storage may be nil (uploads disabled).
type Checker struct {
	Database   Probe
	Migrations Probe
	Storage    Probe
	// Timeout bounds each check run (default 2 s).
	Timeout time.Duration
	// StorageTTL caches the storage result (default 15 s) so frequent probes
	// don't hammer the bucket.
	StorageTTL time.Duration
	Logger     *slog.Logger

	mu          sync.Mutex
	storageAt   time.Time
	storageLast Status
}

// Run executes the checks. Migrations are only probed when the database
// answers; a failing database reports migrations as fail too.
func (c *Checker) Run(ctx context.Context) []Result {
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	out := []Result{{Name: "database", Required: true}, {Name: "migrations", Required: true}}
	out[0].Status = c.run(ctx, "database", c.Database)
	if out[0].Status == OK {
		out[1].Status = c.run(ctx, "migrations", c.Migrations)
	} else {
		out[1].Status = Fail
	}
	st := Result{Name: "storage"}
	switch {
	case c.Storage == nil:
		st.Status = Disabled
	default:
		st.Status = c.storage(ctx)
	}
	return append(out, st)
}

func (c *Checker) run(ctx context.Context, name string, p Probe) Status {
	if p == nil {
		return Fail
	}
	if err := p(ctx); err != nil {
		if c.Logger != nil {
			c.Logger.Warn("readiness check failed", "check", name, "err", err.Error())
		}
		return Fail
	}
	return OK
}

func (c *Checker) storage(ctx context.Context) Status {
	ttl := c.StorageTTL
	if ttl <= 0 {
		ttl = 15 * time.Second
	}
	c.mu.Lock()
	if c.storageLast != "" && time.Since(c.storageAt) < ttl {
		s := c.storageLast
		c.mu.Unlock()
		return s
	}
	c.mu.Unlock()
	s := c.run(ctx, "storage", c.Storage)
	c.mu.Lock()
	c.storageLast, c.storageAt = s, time.Now()
	c.mu.Unlock()
	return s
}

// Live answers 200 as long as the process serves requests.
func Live(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte("ok"))
}

// ReadyHandler runs the checks and answers 200 or 503 with a JSON body of
// check names and statuses (never error text: this is a public URL).
func (c *Checker) ReadyHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		results := c.Run(r.Context())
		checks := make(map[string]Status, len(results))
		for _, res := range results {
			checks[res.Name] = res.Status
		}
		ready := Ready(results)
		status, word := http.StatusOK, "ok"
		if !ready {
			status, word = http.StatusServiceUnavailable, "unavailable"
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": word, "checks": checks})
	}
}
