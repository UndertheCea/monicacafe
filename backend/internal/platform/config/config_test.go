package config

import (
	"os"
	"regexp"
	"strings"
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

// goodProd is a production config that validates; tests break one field at a time.
func goodProd() Config {
	return Config{
		AppEnv:           "production",
		JWTAccessSecret:  "0123456789abcdef0123456789abcdef-a",
		JWTRefreshSecret: "0123456789abcdef0123456789abcdef-r",
		DatabaseURL:      "postgres://monica:Zq8vLr2nXw5tKb7h@db.internal:5432/monicacafe",
		S3SecretKey:      "p4Jm9sQe2Vx7Lt3Bn6Ry",
		MeiliKey:         "h7Tg2Wq9Nc4Xb8Lm",
	}
}

func TestValidate(t *testing.T) {
	if err := goodProd().Validate(); err != nil {
		t.Fatalf("a production config with its own secrets should validate: %v", err)
	}
	tests := []struct {
		name    string
		mut     func(*Config)
		wantErr string // substring; "" = valid
	}{
		{"development keeps the published defaults", func(c *Config) {
			*c = Config{AppEnv: "development", JWTAccessSecret: defaultAccessSecret, JWTRefreshSecret: defaultRefreshSecret,
				DatabaseURL: "postgres://monica:monica_secret@localhost:5432/monicacafe", S3SecretKey: "monica_s3_secret"}
		}, ""},
		{"test env keeps them too", func(c *Config) { c.AppEnv = "test"; c.JWTAccessSecret = defaultAccessSecret }, ""},
		{"APP_ENV unset", func(c *Config) { c.AppEnv = "" }, "APP_ENV"},
		{"APP_ENV typo", func(c *Config) { c.AppEnv = "prod" }, "APP_ENV"},
		{"APP_ENV wrong case", func(c *Config) { c.AppEnv = "Production" }, "APP_ENV"},
		{"code default access secret", func(c *Config) { c.JWTAccessSecret = defaultAccessSecret }, "JWT_ACCESS_SECRET"},
		{"short refresh secret", func(c *Config) { c.JWTRefreshSecret = "0123456789abcdef" }, "JWT_REFRESH_SECRET"},
		{"compose access secret (32 chars)", func(c *Config) { c.JWTAccessSecret = "dev-access-secret-change-in-prod" }, "JWT_ACCESS_SECRET"},
		{"compose refresh secret (33 chars)", func(c *Config) { c.JWTRefreshSecret = "dev-refresh-secret-change-in-prod" }, "JWT_REFRESH_SECRET"},
		{"compose secret, upper-cased and padded", func(c *Config) { c.JWTAccessSecret = "DEV-ACCESS-SECRET-CHANGE-IN-PROD-0000" }, "JWT_ACCESS_SECRET"},
		{"placeholder: dev-", func(c *Config) { c.JWTAccessSecret = "dev-0123456789abcdef0123456789abcdef" }, "JWT_ACCESS_SECRET"},
		{"placeholder: change", func(c *Config) { c.JWTRefreshSecret = "please-change-this-0123456789abcdef" }, "JWT_REFRESH_SECRET"},
		{"identical secrets", func(c *Config) { c.JWTRefreshSecret = c.JWTAccessSecret }, "must differ"},
		{"published database password", func(c *Config) {
			c.DatabaseURL = "postgres://monica:monica_secret@db.internal:5432/monicacafe"
		}, "DATABASE_URL"},
		{"published database password, keyword DSN", func(c *Config) {
			c.DatabaseURL = "host=db user=monica password=monica_secret dbname=monicacafe"
		}, "DATABASE_URL"},
		{"placeholder database password", func(c *Config) {
			c.DatabaseURL = "postgres://monica:change-me@db.internal:5432/monicacafe"
		}, "DATABASE_URL"},
		{"published S3 secret", func(c *Config) { c.S3SecretKey = "monica_s3_secret" }, "S3_SECRET_KEY"},
		{"no S3 secret = uploads off", func(c *Config) { c.S3SecretKey = "" }, ""},
		{"published Meilisearch key", func(c *Config) { c.MeiliKey = "monica_meili_key" }, "MEILI_KEY"},
		{"no Meilisearch key", func(c *Config) { c.MeiliKey = "" }, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := goodProd()
			tt.mut(&c)
			err := c.Validate()
			switch {
			case tt.wantErr == "" && err != nil:
				t.Fatalf("want valid, got %v", err)
			case tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)):
				t.Fatalf("want an error naming %s, got %v", tt.wantErr, err)
			}
		})
	}
}

// Every secret printed in .env.example and docker-compose.yml must be refused
// in production, including ones added later: a new secret-looking variable
// fails this test until it is mapped to the setting that carries it.
func TestPublishedSecretsRefusedInProduction(t *testing.T) {
	apply := map[string]func(*Config, string){
		"JWT_ACCESS_SECRET":  func(c *Config, v string) { c.JWTAccessSecret = v },
		"JWT_REFRESH_SECRET": func(c *Config, v string) { c.JWTRefreshSecret = v },
		"POSTGRES_PASSWORD": func(c *Config, v string) {
			c.DatabaseURL = "postgres://monica:" + v + "@db.internal:5432/monicacafe"
		},
		"DATABASE_URL":  func(c *Config, v string) { c.DatabaseURL = v },
		"S3_SECRET_KEY": func(c *Config, v string) { c.S3SecretKey = v },
		"MEILI_KEY":     func(c *Config, v string) { c.MeiliKey = v },
	}
	// S3_ACCESS_KEY is an account id, not a secret (it travels in every presigned URL).
	secretLike := regexp.MustCompile(`(SECRET|PASSWORD|_KEY)$`)
	assignment := regexp.MustCompile(`^\s*#?\s*([A-Z][A-Z0-9_]*)=(\S+)`)
	composeDefault := regexp.MustCompile(`\$\{([A-Z][A-Z0-9_]*):-([^}]+)\}`)

	type found struct{ file, name, value string }
	var all []found
	for _, file := range []string{"../../../../.env.example", "../../../../docker-compose.yml"} {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for _, line := range strings.Split(string(raw), "\n") {
			if m := assignment.FindStringSubmatch(line); m != nil {
				all = append(all, found{file, m[1], m[2]})
			}
			for _, m := range composeDefault.FindAllStringSubmatch(line, -1) {
				all = append(all, found{file, m[1], m[2]})
			}
		}
	}
	checked := 0
	for _, f := range all {
		if f.name == "S3_ACCESS_KEY" || (!secretLike.MatchString(f.name) && f.name != "DATABASE_URL") {
			continue
		}
		set, ok := apply[f.name]
		if !ok {
			t.Errorf("%s: %s looks like a secret but this test doesn't know which setting carries it; add it to `apply` and to Validate", f.file, f.name)
			continue
		}
		c := goodProd()
		set(&c, f.value)
		if err := c.Validate(); err == nil {
			t.Errorf("%s: production accepted the published %s=%s", f.file, f.name, f.value)
		}
		checked++
	}
	if checked < 8 {
		t.Fatalf("only %d published secrets found; the parser no longer matches the files", checked)
	}
}

func TestDatabaseTarget(t *testing.T) {
	tests := []struct{ dsn, want string }{
		{"postgres://monica:monica_secret@localhost:5432/monicacafe", "localhost:5432/monicacafe"},
		{"postgres://u:p%40ss@db.internal/shop?sslmode=require", "db.internal/shop"},
		{"host=db user=monica password=hunter2 dbname=monicacafe", "(unparsed DATABASE_URL)"},
		{"", "(unparsed DATABASE_URL)"},
	}
	for _, tt := range tests {
		got := Config{DatabaseURL: tt.dsn}.DatabaseTarget()
		if got != tt.want {
			t.Errorf("DatabaseTarget(%q) = %q, want %q", tt.dsn, got, tt.want)
		}
		for _, secret := range []string{"monica_secret", "p%40ss", "p@ss", "hunter2"} {
			if strings.Contains(got, secret) {
				t.Errorf("DatabaseTarget(%q) leaks the password: %q", tt.dsn, got)
			}
		}
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
		cfg := Config{AppEnv: "development", RateLimitLoginIP: c.login, RateLimitLoginEmail: "10/10m"}
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
		cfg := Config{AppEnv: "development", MediaCleanupInterval: c.every, MediaCleanupMinAge: c.age}
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
			if tt.wantErr && (Config{AppEnv: "development", DBMaxConns: tt.max, DBStatementTimeout: tt.tmo}).Validate() == nil {
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
