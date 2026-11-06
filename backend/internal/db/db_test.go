package db

import (
	"testing"
	"time"
)

func TestPoolConfig(t *testing.T) {
	const base = "postgres://u:p@localhost:5432/d"
	tests := []struct {
		name        string
		dsn         string
		opts        Options
		wantMax     int32 // 0: don't check (pgx default)
		wantTimeout string
	}{
		{"defaults untouched", base, Options{}, 0, ""},
		{"max conns", base, Options{MaxConns: 7}, 7, ""},
		{"statement timeout in ms", base, Options{StatementTimeout: 10 * time.Second}, 0, "10000"},
		{"env wins over dsn", base + "?pool_max_conns=50&statement_timeout=99", Options{MaxConns: 5, StatementTimeout: 2500 * time.Millisecond}, 5, "2500"},
		{"dsn kept when option unset", base + "?pool_max_conns=50", Options{}, 50, ""},
		{"min clamped to max", base + "?pool_min_conns=8", Options{MaxConns: 3}, 3, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := poolConfig(tt.dsn, tt.opts)
			if err != nil {
				t.Fatal(err)
			}
			if tt.wantMax != 0 && cfg.MaxConns != tt.wantMax {
				t.Errorf("MaxConns = %d, want %d", cfg.MaxConns, tt.wantMax)
			}
			if cfg.MinConns > cfg.MaxConns {
				t.Errorf("MinConns %d > MaxConns %d", cfg.MinConns, cfg.MaxConns)
			}
			if got := cfg.ConnConfig.RuntimeParams["statement_timeout"]; tt.wantTimeout != "" && got != tt.wantTimeout {
				t.Errorf("statement_timeout = %q, want %q", got, tt.wantTimeout)
			}
		})
	}
	if _, err := poolConfig("::not a dsn", Options{}); err == nil {
		t.Error("bad DSN should fail")
	}
}
