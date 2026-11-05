// Package config loads settings from environment variables.
package config

import (
	"errors"
	"os"
	"strings"
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

	// Object storage for uploaded images (S3-compatible; MinIO in compose).
	// Uploads are disabled when S3AccessKey is empty.
	S3Endpoint     string
	S3Bucket       string
	S3Region       string
	S3AccessKey    string
	S3SecretKey    string
	MediaPublicURL string
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

// Validate rejects configurations that are unsafe to run in production.
func (c Config) Validate() error {
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
