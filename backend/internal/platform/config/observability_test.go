package config

import "testing"

func TestMetricsListen(t *testing.T) {
	tests := []struct {
		name    string
		addr    string
		port    string
		want    string
		wantErr bool
	}{
		{"disabled", "", "4000", "", false},
		{"blank is disabled", "  ", "4000", "", false},
		{"all interfaces", ":9100", "4000", ":9100", false},
		{"loopback", "127.0.0.1:9100", "4000", "127.0.0.1:9100", false},
		{"ipv6", "[::1]:9100", "4000", "[::1]:9100", false},
		{"no port", "localhost", "4000", "", true},
		{"port zero", ":0", "4000", "", true},
		{"port too large", ":70000", "4000", "", true},
		{"not a number", ":metrics", "4000", "", true},
		{"same as the API port", ":4000", "4000", "", true},
	}
	for _, tc := range tests {
		got, err := Config{MetricsAddr: tc.addr, Port: tc.port}.MetricsListen()
		if got != tc.want || (err != nil) != tc.wantErr {
			t.Errorf("%s: MetricsListen(%q) = %q, %v; want %q, err=%v", tc.name, tc.addr, got, err, tc.want, tc.wantErr)
		}
	}
}

func TestObservabilityDefaultsAndValidation(t *testing.T) {
	t.Setenv("METRICS_ADDR", "")
	t.Setenv("SENTRY_DSN", "")
	c := Load()
	if c.MetricsAddr != "127.0.0.1:9100" || c.SentryDSN != "" {
		t.Fatalf("defaults: metrics %q dsn %q", c.MetricsAddr, c.SentryDSN)
	}
	t.Setenv("METRICS_ADDR", ":9200")
	t.Setenv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/5")
	t.Setenv("SENTRY_RELEASE", "abc")
	c = Load()
	if c.MetricsAddr != ":9200" || c.SentryDSN == "" || c.SentryRelease != "abc" {
		t.Fatalf("overrides not read: %+v", c)
	}

	tests := []struct {
		name    string
		edit    func(*Config)
		wantErr bool
	}{
		{"valid", func(*Config) {}, false},
		{"metrics off", func(c *Config) { c.MetricsAddr = "" }, false},
		{"bad metrics addr", func(c *Config) { c.MetricsAddr = "nine-thousand" }, true},
		{"bad dsn", func(c *Config) { c.SentryDSN = "not-a-dsn" }, true},
		{"good dsn", func(c *Config) { c.SentryDSN = "https://k@o1.ingest.sentry.io/5" }, false},
	}
	for _, tc := range tests {
		cfg := goodProd()
		cfg.Port = "4000"
		tc.edit(&cfg)
		if err := cfg.Validate(); (err != nil) != tc.wantErr {
			t.Errorf("%s: Validate() = %v, want error=%v", tc.name, err, tc.wantErr)
		}
	}
}
