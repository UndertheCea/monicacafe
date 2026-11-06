package config

import (
	"testing"
	"time"
)

func TestDefaultsAndOverride(t *testing.T) {
	t.Setenv("PORT", "")
	if Load().Port != "4000" || Load().Locale != "zh-TW" {
		t.Fatal("bad defaults")
	}
	t.Setenv("PORT", "9000")
	if Load().Port != "9000" {
		t.Fatal("override failed")
	}
}

func TestValidate(t *testing.T) {
	dev := Config{AppEnv: "development", JWTAccessSecret: defaultAccessSecret, JWTRefreshSecret: defaultRefreshSecret}
	if err := dev.Validate(); err != nil {
		t.Fatalf("development config should validate: %v", err)
	}
	prod := dev
	prod.AppEnv = "production"
	if err := prod.Validate(); err == nil {
		t.Fatal("production with default secrets must fail")
	}
	prod.JWTAccessSecret = "0123456789abcdef0123456789abcdef-a"
	prod.JWTRefreshSecret = "0123456789abcdef0123456789abcdef-r"
	if err := prod.Validate(); err != nil {
		t.Fatalf("production with strong secrets should validate: %v", err)
	}
	prod.JWTRefreshSecret = prod.JWTAccessSecret
	if err := prod.Validate(); err == nil {
		t.Fatal("identical secrets must fail")
	}
}

func TestCORSOrigins(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", nil},
		{"single", "http://localhost:3000", []string{"http://localhost:3000"}},
		{"list with spaces", "http://localhost, http://localhost:3000", []string{"http://localhost", "http://localhost:3000"}},
		{"trailing slash and blanks", "https://monicafe.tw/,, ", []string{"https://monicafe.tw"}},
		{"dedupe", "http://a.tw,http://a.tw/", []string{"http://a.tw"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Config{CORSOrigin: tt.in}.CORSOrigins()
			if len(got) != len(tt.want) {
				t.Fatalf("CORSOrigins(%q) = %v, want %v", tt.in, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("CORSOrigins(%q) = %v, want %v", tt.in, got, tt.want)
				}
			}
		})
	}
}

func TestTokenPruneEvery(t *testing.T) {
	tests := []struct {
		in      string
		want    time.Duration
		wantErr bool
	}{
		{"", 0, false},
		{"0", 0, false},
		{"1h", time.Hour, false},
		{" 30m ", 30 * time.Minute, false},
		{"1m", time.Minute, false},
		{"59s", 0, true},
		{"-1h", 0, true},
		{"hourly", 0, true},
		{"60", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := Config{TokenPruneInterval: tt.in}.TokenPruneEvery()
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Fatalf("TokenPruneEvery(%q) = %v, %v; want %v, err %v", tt.in, got, err, tt.want, tt.wantErr)
			}
		})
	}
	if err := (Config{AppEnv: "development", TokenPruneInterval: "soon"}).Validate(); err == nil {
		t.Fatal("Validate should reject a bad TOKEN_PRUNE_INTERVAL")
	}
}

func TestRateLimits(t *testing.T) {
	cases := []struct {
		name    string
		login   string
		wantErr bool
	}{
		{"default", "20/1m", false},
		{"disabled", "0", false},
		{"garbage", "lots", true},
		{"sub-second", "5/10ms", true},
	}
	for _, c := range cases {
		cfg := Config{RateLimitLoginIP: c.login, RateLimitLoginEmail: "10/10m"}
		r, err := cfg.RateLimits()
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err = %v", c.name, err)
		}
		if err := cfg.Validate(); (err != nil) != c.wantErr {
			t.Errorf("%s: Validate err = %v", c.name, err)
		}
		if c.name == "default" && (r.LoginIP.Burst != 20 || r.LoginIP.Per != time.Minute || r.LoginEmail.Burst != 10) {
			t.Errorf("default parsed to %+v", r)
		}
	}
}

func TestMediaCleanup(t *testing.T) {
	cases := []struct {
		every, age         string
		wantEvery, wantAge time.Duration
		wantErr            bool
	}{
		{"6h", "24h", 6 * time.Hour, 24 * time.Hour, false},
		{"0", "", 0, 24 * time.Hour, false},
		{"", "48h", 0, 48 * time.Hour, false},
		{"1s", "24h", 0, 0, true},
		{"often", "24h", 0, 0, true},
		{"6h", "10m", 0, 0, true},
	}
	for _, c := range cases {
		cfg := Config{MediaCleanupInterval: c.every, MediaCleanupMinAge: c.age}
		every, age, err := cfg.MediaCleanup()
		if (err != nil) != c.wantErr || every != c.wantEvery || age != c.wantAge {
			t.Errorf("MediaCleanup(%q, %q) = %v, %v, %v", c.every, c.age, every, age, err)
		}
		if verr := cfg.Validate(); (verr != nil) != c.wantErr {
			t.Errorf("Validate(%q, %q) err = %v", c.every, c.age, verr)
		}
	}
}

func TestDBPool(t *testing.T) {
	tests := []struct {
		name        string
		max, tmo    string
		wantMax     int32
		wantTimeout time.Duration
		wantErr     bool
	}{
		{"defaults when blank", "", "", 10, 0, false},
		{"explicit", "25", "10s", 25, 10 * time.Second, false},
		{"timeout off", "5", "0", 5, 0, false},
		{"spaces", " 3 ", " 2s ", 3, 2 * time.Second, false},
		{"zero conns", "0", "10s", 0, 0, true},
		{"too many conns", "1001", "10s", 0, 0, true},
		{"not a number", "ten", "10s", 0, 0, true},
		{"timeout too short", "10", "500ms", 0, 0, true},
		{"timeout garbage", "10", "soon", 0, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Config{DBMaxConns: tt.max, DBStatementTimeout: tt.tmo}
			gotMax, gotTimeout, err := c.DBPool()
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && (gotMax != tt.wantMax || gotTimeout != tt.wantTimeout) {
				t.Fatalf("got (%d, %s), want (%d, %s)", gotMax, gotTimeout, tt.wantMax, tt.wantTimeout)
			}
			if tt.wantErr && (Config{DBMaxConns: tt.max, DBStatementTimeout: tt.tmo}).Validate() == nil {
				t.Fatal("Validate should reject it too")
			}
		})
	}
	t.Setenv("DB_MAX_CONNS", "")
	t.Setenv("DB_STATEMENT_TIMEOUT", "")
	if c := Load(); c.DBMaxConns != "10" || c.DBStatementTimeout != "10s" {
		t.Fatalf("Load defaults = %q / %q, want 10 / 10s", c.DBMaxConns, c.DBStatementTimeout)
	}
}
