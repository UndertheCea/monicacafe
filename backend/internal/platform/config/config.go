// Package config loads settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

type Config struct {
	Port             string
	DatabaseURL      string
	RedisURL         string
	MeiliURL         string
	MeiliKey         string
	JWTAccessSecret  string
	JWTRefreshSecret string
	CORSOrigin       string
	AppEnv           string
	Locale           string

	// Object storage for uploaded images (S3-compatible; SeaweedFS in compose).
	// Uploads are disabled when S3AccessKey is empty.
	S3Endpoint     string
	S3Bucket       string
	S3Region       string
	S3AccessKey    string
	S3SecretKey    string
	MediaPublicURL string
	// Where the API reaches the store itself (list / delete); defaults to S3Endpoint.
	S3InternalEndpoint string

	// Orphaned-image cleanup (#29): how often to sweep ("0" = off) and how
	// old an unreferenced object must be before it's deleted.
	MediaCleanupInterval string
	MediaCleanupMinAge   string

	// How often the API deletes expired refresh tokens (Go duration, e.g.
	// "1h"; "0" turns pruning off). Parsed by TokenPruneEvery.
	TokenPruneInterval string

	// Postgres pool: maximum open connections and the per-statement timeout
	// (Go duration; "0" = no timeout). Parsed by DBPool.
	DBMaxConns         string
	DBStatementTimeout string

	// Comma-separated CIDRs / IPs whose X-Forwarded-For header is believed
	// when working out the client IP (nginx and the Next.js BFF in compose).
	TrustedProxies string

	// Auth rate limits as "N/duration" (burst N, refilled over duration);
	// "0" disables one. Parsed by RateLimits.
	RateLimitLoginIP    string
	RateLimitLoginEmail string
	// RateLimitLoginEmailIP counts failed logins per email + client address.
	RateLimitLoginEmailIP string
	RateLimitRegisterIP   string
	RateLimitRefreshIP    string

	// Per-account limits on signed-in writes.
	RateLimitCommentUser  string
	RateLimitUploadUser   string
	RateLimitPasswordUser string
	RateLimitSaveUser     string
	// RateLimitSellerWriteUser covers every shop / coffee / option mutation.
	RateLimitSellerWriteUser string

	// Every /graphql request, per client IP.
	RateLimitGraphQLIP string
}

func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func Load() Config {
	return Config{
		Port:             get("PORT", "4000"),
		DatabaseURL:      get("DATABASE_URL", "postgres://monica:monica_secret@localhost:5432/monicacafe"),
		RedisURL:         get("REDIS_URL", "redis://localhost:6379"),
		MeiliURL:         get("MEILI_URL", "http://localhost:7700"),
		MeiliKey:         get("MEILI_KEY", ""),
		JWTAccessSecret:  get("JWT_ACCESS_SECRET", defaultAccessSecret),
		JWTRefreshSecret: get("JWT_REFRESH_SECRET", defaultRefreshSecret),
		CORSOrigin:       get("CORS_ORIGIN", "http://localhost,http://localhost:3000"),
		// No default: an unset APP_ENV used to mean "development", which skips
		// the production checks and turns on introspection (#206).
		AppEnv:         get("APP_ENV", ""),
		Locale:         get("LOCALE", "zh-TW"),
		S3Endpoint:     get("S3_ENDPOINT", "http://localhost"),
		S3Bucket:       get("S3_BUCKET", "media"),
		S3Region:       get("S3_REGION", "us-east-1"),
		S3AccessKey:    get("S3_ACCESS_KEY", ""),
		S3SecretKey:    get("S3_SECRET_KEY", ""),
		MediaPublicURL: get("MEDIA_PUBLIC_URL", ""),

		S3InternalEndpoint:   get("S3_INTERNAL_ENDPOINT", ""),
		MediaCleanupInterval: get("MEDIA_CLEANUP_INTERVAL", "6h"),
		MediaCleanupMinAge:   get("MEDIA_CLEANUP_MIN_AGE", "24h"),

		TokenPruneInterval: get("TOKEN_PRUNE_INTERVAL", "1h"),
		DBMaxConns:         get("DB_MAX_CONNS", "10"),
		DBStatementTimeout: get("DB_STATEMENT_TIMEOUT", "10s"),
		TrustedProxies:     get("TRUSTED_PROXIES", DefaultTrustedProxies),

		RateLimitLoginIP:         get("RATE_LIMIT_LOGIN_IP", "20/1m"),
		RateLimitLoginEmail:      get("RATE_LIMIT_LOGIN_EMAIL", "50/10m"),
		RateLimitLoginEmailIP:    get("RATE_LIMIT_LOGIN_EMAIL_IP", "10/10m"),
		RateLimitRegisterIP:      get("RATE_LIMIT_REGISTER_IP", "10/1h"),
		RateLimitRefreshIP:       get("RATE_LIMIT_REFRESH_IP", "60/1m"),
		RateLimitCommentUser:     get("RATE_LIMIT_COMMENT_USER", "5/5m"),
		RateLimitUploadUser:      get("RATE_LIMIT_UPLOAD_USER", "30/10m"),
		RateLimitPasswordUser:    get("RATE_LIMIT_PASSWORD_USER", "5/15m"),
		RateLimitSaveUser:        get("RATE_LIMIT_SAVE_USER", "60/5m"),
		RateLimitSellerWriteUser: get("RATE_LIMIT_SELLER_WRITE_USER", "60/5m"),
		RateLimitGraphQLIP:       get("RATE_LIMIT_GRAPHQL_IP", "600/1m"),
	}
}

// CORSOrigins splits the comma-separated CORS_ORIGIN value into a clean list,
// e.g. "http://localhost, http://localhost:3000" → two origins. Blank entries
// and trailing slashes are dropped; an empty value yields no origins.
func (c Config) CORSOrigins() []string {
	var out []string
	seen := map[string]bool{}
	for _, o := range strings.Split(c.CORSOrigin, ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "" || seen[o] {
			continue
		}
		seen[o] = true
		out = append(out, o)
	}
	return out
}

const (
	defaultAccessSecret  = "change-me-access"
	defaultRefreshSecret = "change-me-refresh"
	minSecretLen         = 32
)

// minPruneInterval stops a typo ("1s") from hammering the database.
const minPruneInterval = time.Minute

// TokenPruneEvery parses TOKEN_PRUNE_INTERVAL. Zero means pruning is off.
func (c Config) TokenPruneEvery() (time.Duration, error) {
	v := strings.TrimSpace(c.TokenPruneInterval)
	if v == "" || v == "0" {
		return 0, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d < minPruneInterval {
		return 0, fmt.Errorf("config: TOKEN_PRUNE_INTERVAL must be a duration of at least %s (or 0 to disable), got %q", minPruneInterval, v)
	}
	return d, nil
}

// Bounds for the Postgres pool settings. A statement timeout under a second
// would cancel ordinary queries under load; 1000 connections exceeds any sane
// Postgres max_connections for one API instance.
const (
	maxDBConns          = 1000
	minStatementTimeout = time.Second
)

// DBPool parses DB_MAX_CONNS and DB_STATEMENT_TIMEOUT (0 = no timeout).
func (c Config) DBPool() (maxConns int32, statementTimeout time.Duration, err error) {
	v := strings.TrimSpace(c.DBMaxConns)
	if v == "" {
		v = "10"
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > maxDBConns {
		return 0, 0, fmt.Errorf("config: DB_MAX_CONNS must be a whole number from 1 to %d, got %q", maxDBConns, c.DBMaxConns)
	}
	v = strings.TrimSpace(c.DBStatementTimeout)
	if v != "" && v != "0" {
		statementTimeout, err = time.ParseDuration(v)
		if err != nil || statementTimeout < minStatementTimeout {
			return 0, 0, fmt.Errorf("config: DB_STATEMENT_TIMEOUT must be a duration of at least %s (or 0 to disable), got %q", minStatementTimeout, v)
		}
	}
	return int32(n), statementTimeout, nil
}

// DefaultTrustedProxies covers loopback and the private ranges docker
// networks use. In production set TRUSTED_PROXIES to your proxies only.
const DefaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

// RateLimitRules are the parsed auth rate limits.
type RateLimitRules struct {
	LoginIP, LoginEmail, RegisterIP, RefreshIP ratelimit.Rule
	LoginEmailIP                               ratelimit.Rule
	CommentUser, UploadUser, PasswordUser      ratelimit.Rule
	SaveUser, SellerWriteUser                  ratelimit.Rule
	GraphQLIP                                  ratelimit.Rule
}

// RateLimits parses the RATE_LIMIT_* settings.
func (c Config) RateLimits() (RateLimitRules, error) {
	var r RateLimitRules
	for _, f := range []struct {
		env, val string
		dst      *ratelimit.Rule
	}{
		{"RATE_LIMIT_LOGIN_IP", c.RateLimitLoginIP, &r.LoginIP},
		{"RATE_LIMIT_LOGIN_EMAIL", c.RateLimitLoginEmail, &r.LoginEmail},
		{"RATE_LIMIT_LOGIN_EMAIL_IP", c.RateLimitLoginEmailIP, &r.LoginEmailIP},
		{"RATE_LIMIT_REGISTER_IP", c.RateLimitRegisterIP, &r.RegisterIP},
		{"RATE_LIMIT_REFRESH_IP", c.RateLimitRefreshIP, &r.RefreshIP},
		{"RATE_LIMIT_COMMENT_USER", c.RateLimitCommentUser, &r.CommentUser},
		{"RATE_LIMIT_UPLOAD_USER", c.RateLimitUploadUser, &r.UploadUser},
		{"RATE_LIMIT_PASSWORD_USER", c.RateLimitPasswordUser, &r.PasswordUser},
		{"RATE_LIMIT_SAVE_USER", c.RateLimitSaveUser, &r.SaveUser},
		{"RATE_LIMIT_SELLER_WRITE_USER", c.RateLimitSellerWriteUser, &r.SellerWriteUser},
		{"RATE_LIMIT_GRAPHQL_IP", c.RateLimitGraphQLIP, &r.GraphQLIP},
	} {
		rule, err := ratelimit.ParseRule(f.val)
		if err != nil {
			return RateLimitRules{}, fmt.Errorf("config: %s: %w", f.env, err)
		}
		*f.dst = rule
	}
	return r, nil
}

// Minimums that stop a typo from hammering the bucket or deleting uploads
// that are still being saved (presigned URLs live 10 minutes).
const (
	minCleanupInterval = time.Minute
	minCleanupAge      = time.Hour
)

// MediaCleanup parses MEDIA_CLEANUP_INTERVAL (0 = off) and MEDIA_CLEANUP_MIN_AGE.
func (c Config) MediaCleanup() (every, minAge time.Duration, err error) {
	if v := strings.TrimSpace(c.MediaCleanupInterval); v != "" && v != "0" {
		every, err = time.ParseDuration(v)
		if err != nil || every < minCleanupInterval {
			return 0, 0, fmt.Errorf("config: MEDIA_CLEANUP_INTERVAL must be a duration of at least %s (or 0 to disable), got %q", minCleanupInterval, v)
		}
	}
	v := strings.TrimSpace(c.MediaCleanupMinAge)
	if v == "" {
		v = "24h"
	}
	minAge, err = time.ParseDuration(v)
	if err != nil || minAge < minCleanupAge {
		return 0, 0, fmt.Errorf("config: MEDIA_CLEANUP_MIN_AGE must be a duration of at least %s, got %q", minCleanupAge, v)
	}
	return every, minAge, nil
}

// publishedSecrets are the development values printed in this repository
// (.env.example, docker-compose.yml, this file). Anyone can read them, so a
// production server refuses every one of them (#206). A test reads
// .env.example and fails when a secret there isn't refused.
var publishedSecrets = []string{
	defaultAccessSecret,
	defaultRefreshSecret,
	"dev-access-secret-change-in-prod",
	"dev-refresh-secret-change-in-prod",
	"monica_secret",
	"monica_s3_secret",
	"monica_meili_key",
}

// placeholderMarks appear in example values ("dev-…", "change-me", "…-change-in-prod").
var placeholderMarks = []string{"dev-", "change"}

// published reports whether v is, or contains, a value from this repository
// or reads like a placeholder that was never replaced.
func published(v string) bool {
	low := strings.ToLower(v)
	for _, p := range publishedSecrets {
		if strings.Contains(low, p) {
			return true
		}
	}
	for _, m := range placeholderMarks {
		if strings.Contains(low, m) {
			return true
		}
	}
	return false
}

// dsnPassword is the password in a postgres:// URL ("" when there is none or
// the DSN is in keyword form).
func dsnPassword(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil || u.User == nil {
		return ""
	}
	pw, _ := u.User.Password()
	return pw
}

// DatabaseTarget is "host/database" from DATABASE_URL, for logs: the DSN
// itself carries the password and must never be logged.
func (c Config) DatabaseTarget() string {
	u, err := url.Parse(c.DatabaseURL)
	if err != nil || u.Host == "" {
		return "(unparsed DATABASE_URL)"
	}
	return u.Host + "/" + strings.TrimPrefix(u.Path, "/")
}

// AppEnvs are the accepted APP_ENV values.
var AppEnvs = []string{"development", "test", "production"}

// Validate rejects settings that can't work, and in production the ones that
// are unsafe: secrets that are missing, short, or published in this repository.
func (c Config) Validate() error {
	known := false
	for _, e := range AppEnvs {
		known = known || c.AppEnv == e
	}
	if !known {
		return fmt.Errorf("config: APP_ENV must be one of %s, got %q", strings.Join(AppEnvs, " / "), c.AppEnv)
	}
	if _, _, err := c.MediaCleanup(); err != nil {
		return err
	}
	if _, err := c.TokenPruneEvery(); err != nil {
		return err
	}
	if _, _, err := c.DBPool(); err != nil {
		return err
	}
	if _, err := c.RateLimits(); err != nil {
		return err
	}
	if c.AppEnv != "production" {
		return nil
	}
	for _, s := range []struct{ env, val string }{
		{"JWT_ACCESS_SECRET", c.JWTAccessSecret},
		{"JWT_REFRESH_SECRET", c.JWTRefreshSecret},
	} {
		if len(s.val) < minSecretLen {
			return fmt.Errorf("config: %s must be set to at least %d characters in production", s.env, minSecretLen)
		}
		if published(s.val) {
			return fmt.Errorf("config: %s is a development value published in the repository; generate a new one for production", s.env)
		}
	}
	if c.JWTAccessSecret == c.JWTRefreshSecret {
		return errors.New("config: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ")
	}
	// The whole DSN is checked too, so a keyword-form DSN can't hide the password.
	if pw := dsnPassword(c.DatabaseURL); published(pw) || strings.Contains(c.DatabaseURL, "monica_secret") {
		return errors.New("config: DATABASE_URL uses a database password published in the repository; set a new POSTGRES_PASSWORD for production")
	}
	// Empty S3 / Meilisearch secrets mean "not used" and are fine.
	if c.S3SecretKey != "" && published(c.S3SecretKey) {
		return errors.New("config: S3_SECRET_KEY is a development value published in the repository; set a new one for production")
	}
	if c.MeiliKey != "" && published(c.MeiliKey) {
		return errors.New("config: MEILI_KEY is a development value published in the repository; set a new one for production")
	}
	return nil
}
