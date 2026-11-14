// Package jobs holds the River background-queue wiring: job kinds, their
// workers, and the client constructor shared by cmd/worker (which runs jobs)
// and, later, the API server (which only enqueues them).
package jobs

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

// DefaultWorkers is how many jobs run at once in the default queue.
const DefaultWorkers = 10

// NoopArgs is a job that does nothing. It proves the queue end to end (insert,
// fetch, run, complete) and is the template for real jobs.
type NoopArgs struct{}

// Kind is the name River stores in river_job.kind.
func (NoopArgs) Kind() string { return "noop" }

// NoopWorker runs NoopArgs jobs.
type NoopWorker struct {
	river.WorkerDefaults[NoopArgs]
}

// Work logs the job and succeeds.
func (w *NoopWorker) Work(ctx context.Context, job *river.Job[NoopArgs]) error {
	slog.InfoContext(ctx, "noop job done", "job_id", job.ID, "attempt", job.Attempt)
	return nil
}

// Workers returns the registry of every job kind this binary can run. Add new
// workers here.
func Workers() *river.Workers {
	w := river.NewWorkers()
	river.AddWorker(w, &NoopWorker{})
	return w
}

// Config returns the River configuration: one default queue running
// maxWorkers jobs at once (non-positive means DefaultWorkers).
func Config(maxWorkers int, workers *river.Workers) *river.Config {
	if maxWorkers <= 0 {
		maxWorkers = DefaultWorkers
	}
	return &river.Config{
		Logger:  slog.Default(),
		Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: maxWorkers}},
		Workers: workers,
	}
}

// NewClient builds a River client on the shared pgx pool. River's tables come
// from migrations/021_river_queue.sql, not from River's own migrator. The
// server can build one and only call Insert; the worker also calls Start.
func NewClient(pool *pgxpool.Pool, maxWorkers int) (*river.Client[pgx.Tx], error) {
	return river.NewClient(riverpgxv5.New(pool), Config(maxWorkers, Workers()))
}
