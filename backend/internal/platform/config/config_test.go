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
