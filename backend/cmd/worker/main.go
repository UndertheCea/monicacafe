package main

import (
	"log/slog"
	"os"

	"github.com/underthecea/monicacafe/backend/internal/platform/config"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()
	// Same checks as the API: the worker must not run in production with
	// published secrets either.
	if err := cfg.Validate(); err != nil {
		slog.Error("worker exited", "err", err)
		os.Exit(1)
	}
	// Host and database name only: the DSN carries the password (#206).
	slog.Info("worker starting", "database", cfg.DatabaseTarget(), "env", cfg.AppEnv)
	// River job queue lands here in stage 2.
	select {}
}
