package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/db"
	"github.com/underthecea/monicacafe/backend/internal/jobs"
	"github.com/underthecea/monicacafe/backend/internal/platform/config"
)

// How long running jobs get to finish after SIGTERM before they are cancelled.
// Keep it under the container's stop grace period.
const (
	drainTimeout  = 25 * time.Second
	cancelTimeout = 5 * time.Second
)

// healthTimeout bounds the database check behind `worker health`.
const healthTimeout = 5 * time.Second

// isHealthCmd reports whether the arguments (without the program name) ask for
// the container healthcheck instead of running the worker.
func isHealthCmd(args []string) bool {
	return len(args) == 1 && args[0] == "health"
}

// health is the compose healthcheck: the worker is fit when the database it
// works from answers. It returns nil when it does.
func health() error {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), healthTimeout)
	defer cancel()
	// db.New pings, so a successful return means the database answered.
	pool, err := db.New(ctx, cfg.DatabaseURL, db.Options{MaxConns: 1})
	if err != nil {
		return err
	}
	pool.Close()
	return nil
}

func main() {
	if isHealthCmd(os.Args[1:]) {
		if err := health(); err != nil {
			fmt.Fprintln(os.Stderr, "unhealthy:", err)
			os.Exit(1)
		}
		return
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("worker exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	// Same checks as the API: the worker must not run in production with
	// published secrets either.
	if err := cfg.Validate(); err != nil {
		return err
	}
	// Host and database name only: the DSN carries the password (#206).
	slog.Info("worker starting", "database", cfg.DatabaseTarget(), "env", cfg.AppEnv)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	maxConns, stmtTimeout, _ := cfg.DBPool() // checked by cfg.Validate
	pool, err := db.New(ctx, cfg.DatabaseURL, db.Options{MaxConns: maxConns, StatementTimeout: stmtTimeout})
	if err != nil {
		return err
	}
	defer pool.Close()

	client, err := jobs.NewClient(pool, jobs.DefaultWorkers)
	if err != nil {
		return err
	}
	// The client's work context is separate from ctx: a signal must stop
	// fetching, not abort the jobs already running.
	if err := client.Start(context.Background()); err != nil {
		return err
	}
	slog.Info("worker ready")

	<-ctx.Done()
	slog.Info("worker stopping", "drain", drainTimeout.String())

	// Graceful: stop fetching, let running jobs finish.
	drain, cancelDrain := context.WithTimeout(context.Background(), drainTimeout)
	defer cancelDrain()
	err = client.Stop(drain)
	if err == nil {
		slog.Info("worker stopped")
		return nil
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	// Still running after the drain: cancel the jobs' contexts and wait briefly.
	slog.Warn("jobs still running; cancelling them")
	hard, cancelHard := context.WithTimeout(context.Background(), cancelTimeout)
	defer cancelHard()
	if err := client.StopAndCancel(hard); err != nil {
		return err
	}
	slog.Info("worker stopped after cancelling jobs")
	return nil
}
