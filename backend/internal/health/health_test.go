package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestReady(t *testing.T) {
	tests := []struct {
		name    string
		results []Result
		want    bool
	}{
		{"nothing to check", nil, true},
		{"all ok", []Result{{"database", OK, true}, {"migrations", OK, true}, {"storage", OK, false}}, true},
		{"database down", []Result{{"database", Fail, true}, {"migrations", Fail, true}}, false},
		{"migrations behind", []Result{{"database", OK, true}, {"migrations", Fail, true}}, false},
		{"storage down is only reported", []Result{{"database", OK, true}, {"migrations", OK, true}, {"storage", Fail, false}}, true},
		{"storage disabled", []Result{{"database", OK, true}, {"migrations", OK, true}, {"storage", Disabled, false}}, true},
		{"required but disabled", []Result{{"database", Disabled, true}}, false},
	}
	for _, tc := range tests {
		if got := Ready(tc.results); got != tc.want {
			t.Errorf("%s: Ready = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func okProbe(context.Context) error  { return nil }
func badProbe(context.Context) error { return errors.New("down") }

func TestCheckerRun(t *testing.T) {
	tests := []struct {
		name    string
		c       *Checker
		want    map[string]Status
		ready   bool
		httpOut int
	}{
		{"healthy", &Checker{Database: okProbe, Migrations: okProbe, Storage: okProbe},
			map[string]Status{"database": OK, "migrations": OK, "storage": OK}, true, 200},
		{"no storage configured", &Checker{Database: okProbe, Migrations: okProbe},
			map[string]Status{"database": OK, "migrations": OK, "storage": Disabled}, true, 200},
		{"storage failing still ready", &Checker{Database: okProbe, Migrations: okProbe, Storage: badProbe},
			map[string]Status{"database": OK, "migrations": OK, "storage": Fail}, true, 200},
		{"database failing", &Checker{Database: badProbe, Migrations: okProbe},
			map[string]Status{"database": Fail, "migrations": Fail, "storage": Disabled}, false, 503},
		{"migrations behind", &Checker{Database: okProbe, Migrations: MigrationProbe(func(context.Context, string) (bool, error) { return false, nil }, "016_x")},
			map[string]Status{"database": OK, "migrations": Fail, "storage": Disabled}, false, 503},
		{"migrations table missing", &Checker{Database: okProbe, Migrations: MigrationProbe(func(context.Context, string) (bool, error) { return false, errors.New("relation does not exist") }, "016_x")},
			map[string]Status{"database": OK, "migrations": Fail, "storage": Disabled}, false, 503},
		{"no probes wired", &Checker{}, map[string]Status{"database": Fail, "migrations": Fail, "storage": Disabled}, false, 503},
	}
	for _, tc := range tests {
		results := tc.c.Run(context.Background())
		got := map[string]Status{}
		for _, r := range results {
			got[r.Name] = r.Status
		}
		for k, v := range tc.want {
			if got[k] != v {
				t.Errorf("%s: %s = %q, want %q", tc.name, k, got[k], v)
			}
		}
		if Ready(results) != tc.ready {
			t.Errorf("%s: ready = %v, want %v", tc.name, Ready(results), tc.ready)
		}
		rec := httptest.NewRecorder()
		tc.c.ReadyHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
		if rec.Code != tc.httpOut {
			t.Errorf("%s: HTTP %d, want %d", tc.name, rec.Code, tc.httpOut)
		}
		if strings.Contains(rec.Body.String(), "relation") || strings.Contains(rec.Body.String(), "down") {
			t.Errorf("%s: error text leaked into the public body: %s", tc.name, rec.Body)
		}
	}
}

func TestStorageResultIsCached(t *testing.T) {
	calls := 0
	c := Checker{Database: okProbe, Migrations: okProbe, Storage: func(context.Context) error { calls++; return nil }}
	for range 3 {
		c.Run(context.Background())
	}
	if calls != 1 {
		t.Errorf("storage probed %d times in a row, want 1 (cached)", calls)
	}
}

func TestLive(t *testing.T) {
	rec := httptest.NewRecorder()
	Live(rec, httptest.NewRequest(http.MethodGet, "/health/live", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Errorf("Live = %d %q", rec.Code, rec.Body)
	}
}

// TestExpectedMigrationIsNewest keeps ExpectedMigration in step with
// migrations/: add a migration, bump the constant.
func TestExpectedMigrationIsNewest(t *testing.T) {
	files, err := filepath.Glob("../../../migrations/[0-9][0-9][0-9]_*.sql")
	if err != nil || len(files) == 0 {
		t.Fatalf("no migrations found: %v", err)
	}
	var names []string
	for _, f := range files {
		names = append(names, strings.TrimSuffix(filepath.Base(f), ".sql"))
	}
	sort.Strings(names)
	if newest := names[len(names)-1]; newest != ExpectedMigration {
		t.Errorf("newest migration is %s but health.ExpectedMigration is %s; update the constant", newest, ExpectedMigration)
	}
	if _, err := os.Stat("../../../migrations/" + ExpectedMigration + ".sql"); err != nil {
		t.Error(err)
	}
}
