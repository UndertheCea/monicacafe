// Package config loads settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
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

	// How often the API deletes expired refresh tokens (Go duration, e.g.
	// "1h"; "0" turns pruning off). Parsed by TokenPruneEvery.
	TokenPruneInterval string

	// Comma-separated CIDRs / IPs whose X-Forwarded-For header is believed
	// when working out the client IP (nginx and the Next.js BFF in compose).
	TrustedProxies string

	// Auth rate limits as "N/duration" (burst N, refilled over duration);
	// "0" disables one. Parsed by RateLimits.
	RateLimitLoginIP    string
	RateLimitLoginEmail string
	RateLimitRegisterIP string
	RateLimitRefreshIP  string

	// Per-account limits on signed-in writes.
	RateLimitCommentUser string
	RateLimitUploadUser  string
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
		AppEnv:           get("APP_ENV", "development"),
		Locale:           get("LOCALE", "zh-TW"),
		S3Endpoint:       get("S3_ENDPOINT", "http://localhost"),
		S3Bucket:         get("S3_BUCKET", "media"),
		S3Region:         get("S3_REGION", "us-east-1"),
		S3AccessKey:      get("S3_ACCESS_KEY", ""),
		S3SecretKey:      get("S3_SECRET_KEY", ""),
		MediaPublicURL:   get("MEDIA_PUBLIC_URL", ""),

		TokenPruneInterval: get("TOKEN_PRUNE_INTERVAL", "1h"),
		TrustedProxies:     get("TRUSTED_PROXIES", DefaultTrustedProxies),

		RateLimitLoginIP:     get("RATE_LIMIT_LOGIN_IP", "20/1m"),
		RateLimitLoginEmail:  get("RATE_LIMIT_LOGIN_EMAIL", "10/10m"),
		RateLimitRegisterIP:  get("RATE_LIMIT_REGISTER_IP", "10/1h"),
		RateLimitRefreshIP:   get("RATE_LIMIT_REFRESH_IP", "60/1m"),
		RateLimitCommentUser: get("RATE_LIMIT_COMMENT_USER", "5/5m"),
		RateLimitUploadUser:  get("RATE_LIMIT_UPLOAD_USER", "30/10m"),
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

// DefaultTrustedProxies covers loopback and the private ranges docker
// networks use. In production set TRUSTED_PROXIES to your proxies only.
const DefaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

// RateLimitRules are the parsed auth rate limits.
type RateLimitRules struct {
	LoginIP, LoginEmail, RegisterIP, RefreshIP ratelimit.Rule
	CommentUser, UploadUser                    ratelimit.Rule
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
		{"RATE_LIMIT_REGISTER_IP", c.RateLimitRegisterIP, &r.RegisterIP},
		{"RATE_LIMIT_REFRESH_IP", c.RateLimitRefreshIP, &r.RefreshIP},
		{"RATE_LIMIT_COMMENT_USER", c.RateLimitCommentUser, &r.CommentUser},
		{"RATE_LIMIT_UPLOAD_USER", c.RateLimitUploadUser, &r.UploadUser},
	} {
		rule, err := ratelimit.ParseRule(f.val)
		if err != nil {
			return RateLimitRules{}, fmt.Errorf("config: %s: %w", f.env, err)
		}
		*f.dst = rule
	}
	return r, nil
}

// Validate rejects configurations that are unsafe to run in production.
func (c Config) Validate() error {
	if _, err := c.TokenPruneEvery(); err != nil {
		return err
	}
	if _, err := c.RateLimits(); err != nil {
		return err
	}
	if c.AppEnv != "production" {
		return nil
	}
	if c.JWTAccessSecret == defaultAccessSecret || len(c.JWTAccessSecret) < minSecretLen {
		return errors.New("config: JWT_ACCESS_SECRET must be set to at least 32 characters in production")
	}
	if c.JWTRefreshSecret == defaultRefreshSecret || len(c.JWTRefreshSecret) < minSecretLen {
		return errors.New("config: JWT_REFRESH_SECRET must be set to at least 32 characters in production")
	}
	if c.JWTAccessSecret == c.JWTRefreshSecret {
		return errors.New("config: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ")
	}
	return nil
}
