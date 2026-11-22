// Package config loads settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/errreport"
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

	// Public origin of the site (the frontend's SITE_URL). The API only reads
	// it to refuse an unsafe production setup (#287): an http:// origin means
	// the refresh cookie is not Secure.
	SiteURL string
	// "true" when compose would load demo data / the backup job may write
	// unencrypted dumps. Strings, parsed by Validate; both refused in production.
	SeedDemoData         string
	BackupAllowPlaintext string

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
	// Safety catch (#288): refuse a run that would delete more than this share
	// of the listed objects ("0" = no share limit); DRY_RUN only counts and logs.
	MediaCleanupMaxFraction string
	MediaCleanupDryRun      string

	// Bytes of images one shop may presign per rolling 24h (0 = unlimited).
	// Parsed by UploadDailyBytes.
	UploadDailyBytesPerShop string

	// How often the API deletes expired refresh tokens (Go duration, e.g.
	// "1h"; "0" turns pruning off). Parsed by TokenPruneEvery.
	TokenPruneInterval string

	// How often the API deletes cart lines untouched for 90 days (Go duration;
	// "0" turns the expiry off). Parsed by CartPruneEvery.
	CartPruneInterval string

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
	RateLimitCartUser     string
	RateLimitReportUser   string
	// RateLimitSellerWriteUser covers every shop / coffee / option mutation.
	RateLimitSellerWriteUser string
	// RateLimitExportUser caps "download my data" exports (#270).
	RateLimitExportUser string
	// RateLimitAccountWriteUser covers the account writes with no bucket of
	// their own: deleting a comment, signing out everywhere and every admin
	// action (#283).
	RateLimitAccountWriteUser string
	// RateLimitProfileUser caps display-name changes (#286).
	RateLimitProfileUser string

	// Every /graphql request, per client IP.
	RateLimitGraphQLIP string

	// Where the internal /metrics listener binds ("host:port" or ":port";
	// empty turns it off). Never routed by nginx. Parsed by MetricsListen.
	MetricsAddr string

	// Error reporting (#221): a Sentry-compatible DSN; empty = no reporting.
	// SentryRelease tags events with the build (e.g. a git SHA).
	SentryDSN     string
	SentryRelease string
}

func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// getOrEmpty is get for a variable whose empty value means "off": unset
// gives the default, set-but-empty gives "" (#359: METRICS_ADDR= disables
// /metrics, as .env.example says).
func getOrEmpty(k, d string) string {
	if v, ok := os.LookupEnv(k); ok {
		return v
	}
	return d
}

// RedisURL and MeiliURL* are reserved and optional (#222): nothing reads them yet
// and compose starts those services only under the cache / search profiles.
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
		AppEnv:               get("APP_ENV", ""),
		Locale:               get("LOCALE", "zh-TW"),
		SiteURL:              get("SITE_URL", ""),
		SeedDemoData:         get("SEED_DEMO_DATA", ""),
		BackupAllowPlaintext: get("BACKUP_ALLOW_PLAINTEXT", ""),
		S3Endpoint:           get("S3_ENDPOINT", "http://localhost"),
		S3Bucket:             get("S3_BUCKET", "media"),
		S3Region:             get("S3_REGION", "us-east-1"),
		S3AccessKey:          get("S3_ACCESS_KEY", ""),
		S3SecretKey:          get("S3_SECRET_KEY", ""),
		MediaPublicURL:       get("MEDIA_PUBLIC_URL", ""),

		S3InternalEndpoint:   get("S3_INTERNAL_ENDPOINT", ""),
		MediaCleanupInterval: get("MEDIA_CLEANUP_INTERVAL", "6h"),
		MediaCleanupMinAge:   get("MEDIA_CLEANUP_MIN_AGE", "24h"),

		MediaCleanupMaxFraction: get("MEDIA_CLEANUP_MAX_FRACTION", "0.2"),
		MediaCleanupDryRun:      get("MEDIA_CLEANUP_DRY_RUN", "false"),

		UploadDailyBytesPerShop: get("UPLOAD_DAILY_BYTES_PER_SHOP", "209715200"), // 200 MiB

		TokenPruneInterval: get("TOKEN_PRUNE_INTERVAL", "1h"),
		CartPruneInterval:  get("CART_PRUNE_INTERVAL", "6h"),
		DBMaxConns:         get("DB_MAX_CONNS", "10"),
		DBStatementTimeout: get("DB_STATEMENT_TIMEOUT", "10s"),
		TrustedProxies:     get("TRUSTED_PROXIES", DefaultTrustedProxies),

		RateLimitLoginIP:          get("RATE_LIMIT_LOGIN_IP", "20/1m"),
		RateLimitLoginEmail:       get("RATE_LIMIT_LOGIN_EMAIL", "50/10m"),
		RateLimitLoginEmailIP:     get("RATE_LIMIT_LOGIN_EMAIL_IP", "10/10m"),
		RateLimitRegisterIP:       get("RATE_LIMIT_REGISTER_IP", "10/1h"),
		RateLimitRefreshIP:        get("RATE_LIMIT_REFRESH_IP", "60/1m"),
		RateLimitCommentUser:      get("RATE_LIMIT_COMMENT_USER", "5/5m"),
		RateLimitUploadUser:       get("RATE_LIMIT_UPLOAD_USER", "30/10m"),
		RateLimitPasswordUser:     get("RATE_LIMIT_PASSWORD_USER", "5/15m"),
		RateLimitSaveUser:         get("RATE_LIMIT_SAVE_USER", "60/5m"),
		RateLimitCartUser:         get("RATE_LIMIT_CART_USER", "120/5m"),
		RateLimitReportUser:       get("RATE_LIMIT_REPORT_USER", "10/1h"),
		RateLimitSellerWriteUser:  get("RATE_LIMIT_SELLER_WRITE_USER", "60/5m"),
		RateLimitExportUser:       get("RATE_LIMIT_EXPORT_USER", "10/1h"),
		RateLimitAccountWriteUser: get("RATE_LIMIT_ACCOUNT_WRITE_USER", "60/5m"),
		RateLimitProfileUser:      get("RATE_LIMIT_PROFILE_USER", "10/1h"),
		RateLimitGraphQLIP:        get("RATE_LIMIT_GRAPHQL_IP", "600/1m"),

		// Loopback by default (a bare `go run` must not expose metrics);
		// compose sets ":9100", reachable on the compose network only.
		MetricsAddr:   getOrEmpty("METRICS_ADDR", "127.0.0.1:9100"),
		SentryDSN:     get("SENTRY_DSN", ""),
		SentryRelease: get("SENTRY_RELEASE", ""),
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
	return parsePruneInterval("TOKEN_PRUNE_INTERVAL", c.TokenPruneInterval)
}

// CartPruneEvery parses CART_PRUNE_INTERVAL. Zero means the cart-line expiry
// is off.
func (c Config) CartPruneEvery() (time.Duration, error) {
	return parsePruneInterval("CART_PRUNE_INTERVAL", c.CartPruneInterval)
}

func parsePruneInterval(name, raw string) (time.Duration, error) {
	v := strings.TrimSpace(raw)
	if v == "" || v == "0" {
		return 0, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d < minPruneInterval {
		return 0, fmt.Errorf("config: %s must be a duration of at least %s (or 0 to disable), got %q", name, minPruneInterval, v)
	}
	return d, nil
}

// UploadDailyBytes parses UPLOAD_DAILY_BYTES_PER_SHOP: a whole number of
// bytes, 0 meaning no daily budget.
func (c Config) UploadDailyBytes() (int64, error) {
	v := strings.TrimSpace(c.UploadDailyBytesPerShop)
	if v == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("config: UPLOAD_DAILY_BYTES_PER_SHOP must be a whole number of bytes (0 = unlimited), got %q", v)
	}
	return n, nil
}

// Bounds for the Postgres pool settings. A statement timeout under a second
// would cancel ordinary queries under load; 1000 connections exceeds any sane
// Postgres max_connections for one API instance.
const (
	maxDBConns = 1000
	// minDBConns: each of the API's three background sweeps (token, cart and
	// media prune) holds one connection for its advisory lock while its SQL
	// runs on another, and they can all start together. Three lock
	// connections + one to make progress + one for requests (#357); below
	// this a startup sweep can wait forever for a connection and every
	// request with it.
	minDBConns          = 5
	minStatementTimeout = time.Second
)

// DBPool parses DB_MAX_CONNS and DB_STATEMENT_TIMEOUT (0 = no timeout).
func (c Config) DBPool() (maxConns int32, statementTimeout time.Duration, err error) {
	v := strings.TrimSpace(c.DBMaxConns)
	if v == "" {
		v = "10"
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < minDBConns || n > maxDBConns {
		return 0, 0, fmt.Errorf("config: DB_MAX_CONNS must be a whole number from %d to %d (the background sweeps hold up to 4 connections), got %q", minDBConns, maxDBConns, c.DBMaxConns)
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

// MetricsListen validates METRICS_ADDR: "" (disabled) or host:port with a
// port from 1 to 65535. The metrics port must differ from PORT.
func (c Config) MetricsListen() (string, error) {
	v := strings.TrimSpace(c.MetricsAddr)
	if v == "" {
		return "", nil
	}
	_, port, err := net.SplitHostPort(v)
	n, perr := strconv.Atoi(port)
	if err != nil || perr != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("config: METRICS_ADDR must be host:port (e.g. :9100) or empty to disable, got %q", c.MetricsAddr)
	}
	if port == strings.TrimSpace(c.Port) {
		return "", fmt.Errorf("config: METRICS_ADDR port %s is the API's own PORT; metrics need a separate port", port)
	}
	return v, nil
}

// DefaultTrustedProxies covers loopback and the private ranges docker
// networks use. In production set TRUSTED_PROXIES to your proxies only.
const DefaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

// RateLimitRules are the parsed auth rate limits.
type RateLimitRules struct {
	LoginIP, LoginEmail, RegisterIP, RefreshIP          ratelimit.Rule
	LoginEmailIP                                        ratelimit.Rule
	CommentUser, UploadUser, PasswordUser               ratelimit.Rule
	SaveUser, SellerWriteUser, ReportUser               ratelimit.Rule
	ExportUser, CartUser, AccountWriteUser, ProfileUser ratelimit.Rule
	GraphQLIP                                           ratelimit.Rule
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
		{"RATE_LIMIT_REPORT_USER", c.RateLimitReportUser, &r.ReportUser},
		{"RATE_LIMIT_SELLER_WRITE_USER", c.RateLimitSellerWriteUser, &r.SellerWriteUser},
		{"RATE_LIMIT_EXPORT_USER", c.RateLimitExportUser, &r.ExportUser},
		{"RATE_LIMIT_PROFILE_USER", c.RateLimitProfileUser, &r.ProfileUser},
		{"RATE_LIMIT_CART_USER", c.RateLimitCartUser, &r.CartUser},
		{"RATE_LIMIT_ACCOUNT_WRITE_USER", c.RateLimitAccountWriteUser, &r.AccountWriteUser},
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

// MediaCleanupSafety parses MEDIA_CLEANUP_MAX_FRACTION (0..1, default 0.2; 0 =
// no share limit, the "database references nothing" check always stays on) and
// MEDIA_CLEANUP_DRY_RUN (true / false) (#288).
func (c Config) MediaCleanupSafety() (maxFraction float64, dryRun bool, err error) {
	maxFraction = 0.2
	if v := strings.TrimSpace(c.MediaCleanupMaxFraction); v != "" {
		maxFraction, err = strconv.ParseFloat(v, 64)
		// Written as "not in range" so NaN (which ParseFloat accepts and which
		// fails every comparison) is refused too (#421).
		if err != nil || !(maxFraction >= 0 && maxFraction <= 1) {
			return 0, false, fmt.Errorf("config: MEDIA_CLEANUP_MAX_FRACTION must be a number from 0 to 1 (0 = no limit), got %q", v)
		}
	}
	if v := strings.TrimSpace(c.MediaCleanupDryRun); v != "" {
		dryRun, err = strconv.ParseBool(v)
		if err != nil {
			return 0, false, fmt.Errorf("config: MEDIA_CLEANUP_DRY_RUN must be true or false, got %q", v)
		}
	}
	return maxFraction, dryRun, nil
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
// A mark counts only at the start of the value or right after a character that
// is not an ASCII letter or digit, so "Exchange-rate-2024" and "Sandev-key99"
// are not mistaken for placeholders (#446).
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
		if hasWordMark(low, m) {
			return true
		}
	}
	return false
}

// hasWordMark reports whether mark occurs in low at the start or right after a
// character that is not an ASCII letter or digit.
func hasWordMark(low, mark string) bool {
	for i := 0; ; {
		j := strings.Index(low[i:], mark)
		if j < 0 {
			return false
		}
		j += i
		if j == 0 {
			return true
		}
		c := low[j-1]
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9') {
			return true
		}
		i = j + 1
	}
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

// ReservedBuckets are the first path segments nginx or the site already serve.
// nginx routes /<S3_BUCKET>/ to the image store (nginx/media.conf.template), so
// a bucket with one of these names would take those pages or the API over
// (#476). A test keeps the list in step with frontend/app.
var ReservedBuckets = []string{
	"api", "graphql", "health", "nginx-health",
	"account", "admin", "cart", "coffees", "dashboard", "login", "map", "menu", "register", "shops",
}

// bucketName: an S3 bucket name (3–63 lowercase letters, digits, '-' and '.',
// starting and ending with a letter or digit).
var bucketName = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

// checkS3Bucket refuses a bucket name S3 wouldn't accept or one that shadows a
// route. Only checked when uploads are on (S3_ACCESS_KEY set).
func (c Config) checkS3Bucket() error {
	if c.S3AccessKey == "" {
		return nil
	}
	if !bucketName.MatchString(c.S3Bucket) || strings.Contains(c.S3Bucket, "..") {
		return fmt.Errorf("config: S3_BUCKET must be an S3 bucket name (3-63 lowercase letters, digits, '-' or '.'), got %q", c.S3Bucket)
	}
	for _, r := range ReservedBuckets {
		if c.S3Bucket == r {
			return fmt.Errorf("config: S3_BUCKET %q is a path the site already serves (nginx routes /<bucket>/ to the image store); pick another name", c.S3Bucket)
		}
	}
	return nil
}

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
	if err := c.checkS3Bucket(); err != nil {
		return err
	}
	if _, _, err := c.MediaCleanup(); err != nil {
		return err
	}
	if _, _, err := c.MediaCleanupSafety(); err != nil {
		return err
	}
	if _, err := c.TokenPruneEvery(); err != nil {
		return err
	}
	if _, err := c.CartPruneEvery(); err != nil {
		return err
	}
	if _, err := c.UploadDailyBytes(); err != nil {
		return err
	}
	if _, _, err := c.DBPool(); err != nil {
		return err
	}
	if _, err := c.RateLimits(); err != nil {
		return err
	}
	if _, err := c.MetricsListen(); err != nil {
		return err
	}
	if _, err := errreport.ParseDSN(c.SentryDSN); err != nil {
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
	if err := c.validateExposure(); err != nil {
		return err
	}
	// Empty S3 / Meilisearch secrets mean "not used" and are fine.
	if c.S3AccessKey != "" && (published(c.S3AccessKey) || strings.EqualFold(c.S3AccessKey, "monica_s3")) {
		return errors.New("config: S3_ACCESS_KEY is the development value published in the repository; set a new one for production")
	}
	if c.S3SecretKey != "" && published(c.S3SecretKey) {
		return errors.New("config: S3_SECRET_KEY is a development value published in the repository; set a new one for production")
	}
	if c.MeiliKey != "" && published(c.MeiliKey) {
		return errors.New("config: MEILI_KEY is a development value published in the repository; set a new one for production")
	}
	return nil
}

// localHost reports whether a URL host is this machine ("localhost",
// "*.localhost", a loopback or unspecified address).
func localHost(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	if h == "localhost" || strings.HasSuffix(h, ".localhost") {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && (ip.IsLoopback() || ip.IsUnspecified())
}

// httpsOrigin checks that raw is an https URL on a real host (not localhost).
func httpsOrigin(env, raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return fmt.Errorf("config: %s has an entry that is not a URL: %q", env, raw)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("config: %s must be https:// in production (an http:// origin leaves the refresh cookie without Secure), got %q", env, raw)
	}
	if localHost(u.Hostname()) {
		return fmt.Errorf("config: %s must not point at localhost in production, got %q", env, raw)
	}
	return nil
}

// truthy reads a true/false setting; blank and unparsable values are false.
func truthy(v string) bool {
	b, err := strconv.ParseBool(strings.TrimSpace(v))
	return err == nil && b
}

// validateExposure holds the production checks that stop a copied dev setup
// from going public (#287): origins, TLS, proxies, demo data and plaintext backups.
func (c Config) validateExposure() error {
	origins := c.CORSOrigins()
	if len(origins) == 0 {
		return errors.New("config: CORS_ORIGIN must be set in production to your site's https:// origin")
	}
	for _, o := range origins {
		if o == "*" {
			return errors.New("config: CORS_ORIGIN must list origins, not *")
		}
		if err := httpsOrigin("CORS_ORIGIN", o); err != nil {
			return err
		}
	}
	if strings.TrimSpace(c.SiteURL) == "" {
		return errors.New("config: SITE_URL must be set in production to your site's https:// origin")
	}
	if err := httpsOrigin("SITE_URL", strings.TrimSpace(c.SiteURL)); err != nil {
		return err
	}
	// TRUSTED_PROXIES: the built-in fallback trusts every private range, so
	// "unset" is refused; so is trusting the whole internet.
	tp := strings.TrimSpace(c.TrustedProxies)
	if tp == "" || tp == DefaultTrustedProxies {
		return errors.New("config: TRUSTED_PROXIES must be set explicitly in production to your proxies only (the compose default lists loopback and the compose subnet); the built-in default trusts every private range")
	}
	for _, p := range strings.Split(tp, ",") {
		if p = strings.TrimSpace(p); trustsEveryone(p) {
			return fmt.Errorf("config: TRUSTED_PROXIES must not contain %s: anything trusted can claim any client IP", p)
		}
	}
	if truthy(c.SeedDemoData) {
		return errors.New("config: SEED_DEMO_DATA must be false in production: demo shops and accounts are public in this repository")
	}
	if truthy(c.BackupAllowPlaintext) {
		return errors.New("config: BACKUP_ALLOW_PLAINTEXT must be false in production: set BACKUP_AGE_RECIPIENT so dumps are encrypted")
	}
	return nil
}

// trustsEveryone reports whether a TRUSTED_PROXIES entry covers a whole address
// family: 0.0.0.0/0, ::/0, or the IPv4-mapped ::ffff:0:0/96, which the client-IP
// middleware treats as 0.0.0.0/0. Entries that don't parse are left to
// middleware.ParsePrefixes, which refuses them at startup.
func trustsEveryone(entry string) bool {
	p, err := netip.ParsePrefix(entry)
	if err != nil {
		return false
	}
	bits := p.Bits()
	if p.Addr().Is4In6() && bits >= 96 {
		bits -= 96
	}
	return bits == 0
}
