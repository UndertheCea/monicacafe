// Package config loads settings from environment variables.
package config

import "os"

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
		JWTAccessSecret:  get("JWT_ACCESS_SECRET", "change-me-access"),
		JWTRefreshSecret: get("JWT_REFRESH_SECRET", "change-me-refresh"),
		CORSOrigin:       get("CORS_ORIGIN", "http://localhost:3000"),
		AppEnv:           get("APP_ENV", "development"),
		Locale:           get("LOCALE", "zh-TW"),
	}
}
