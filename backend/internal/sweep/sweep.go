// Package sweep runs periodic background jobs (token pruning, orphaned-image
// cleanup) so that they stop on context cancel, can be awaited before the
// database pool closes, and run in only one API instance at a time (#221).
package sweep

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Locker serialises a job across instances. TryLock returns acquired=false
// (and no error) when another instance holds the lock; otherwise the caller
// must call release exactly once.
type Locker interface {
	TryLock(ctx context.Context, key int64) (release func(), acquired bool, err error)
}

// Job is one periodic task.
type Job struct {
	Name string
	// Key is the advisory-lock key; unique per job.
	Key   int64
	Every time.Duration
	// RunNow runs once immediately instead of waiting one Every first.
	RunNow bool
	// Run does the work and returns how many rows / objects it deleted.
	Run func(ctx context.Context) (deleted int, err error)
}

// Outcomes reported to Observe.
const (
	OutcomeOK      = "ok"
	OutcomeError   = "error"
	OutcomeSkipped = "skipped"
)

// Runner starts jobs and tracks them for Wait.
type Runner struct {
	Locker Locker
	// Observe, when set, is told about every run (metrics).
	Observe func(job, outcome string, deleted int)
	Logger  *slog.Logger
	wg      sync.WaitGroup
}

func (r *Runner) logger() *slog.Logger {
	if r.Logger != nil {
		return r.Logger
	}
	return slog.Default()
}

// Start runs job in the background until ctx is cancelled.
func (r *Runner) Start(ctx context.Context, job Job) {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		r.loop(ctx, job)
	}()
}

// Wait blocks until every started job has returned, which happens promptly
// after the context given to Start is cancelled. Call it before closing the
// database pool.
func (r *Runner) Wait() { r.wg.Wait() }

func (r *Runner) loop(ctx context.Context, job Job) {
	ticker := time.NewTicker(job.Every)
	defer ticker.Stop()
	if job.RunNow {
		r.RunOnce(ctx, job)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		r.RunOnce(ctx, job)
	}
}

// RunOnce takes the job's lock and runs it, unless another instance holds the
// lock or ctx is done. Failures are logged and counted, never returned: the
// next tick retries.
func (r *Runner) RunOnce(ctx context.Context, job Job) {
	if ctx.Err() != nil {
		return
	}
	outcome, deleted := r.runLocked(ctx, job)
	if r.Observe != nil && !(outcome == OutcomeError && ctx.Err() != nil) {
		r.Observe(job.Name, outcome, deleted)
	}
}

func (r *Runner) runLocked(ctx context.Context, job Job) (string, int) {
	release := func() {}
	if r.Locker != nil {
		rel, ok, err := r.Locker.TryLock(ctx, job.Key)
		switch {
		case err != nil:
			if ctx.Err() == nil {
				r.logger().Warn("sweep lock failed", "job", job.Name, "err", err)
			}
			return OutcomeError, 0
		case !ok:
			r.logger().Debug("sweep skipped: another instance is running it", "job", job.Name)
			return OutcomeSkipped, 0
		}
		release = rel
	}
	defer release()
	n, err := job.Run(ctx)
	if err != nil {
		if ctx.Err() == nil {
			r.logger().Warn("sweep failed", "job", job.Name, "err", err, "deleted", n)
		}
		return OutcomeError, n
	}
	return OutcomeOK, n
}

// PGLocker takes session-level Postgres advisory locks on a dedicated pool
// connection. The connection is held for the whole job, so it counts against
// the pool's maximum.
type PGLocker struct{ Pool *pgxpool.Pool }

// TryLock implements Locker with pg_try_advisory_lock.
func (l PGLocker) TryLock(ctx context.Context, key int64) (func(), bool, error) {
	conn, err := l.Pool.Acquire(ctx)
	if err != nil {
		return nil, false, err
	}
	var got bool
	if err := conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", key).Scan(&got); err != nil {
		conn.Release()
		return nil, false, err
	}
	if !got {
		conn.Release()
		return nil, false, nil
	}
	release := func() {
		// ctx may be cancelled (shutdown); unlock on a fresh, short one.
		uctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		var unlocked bool
		if err := conn.QueryRow(uctx, "SELECT pg_advisory_unlock($1)", key).Scan(&unlocked); err != nil || !unlocked {
			// Never hand a connection that may still hold the lock back to the
			// pool: close it, which drops the session and the lock with it.
			_ = conn.Conn().Close(context.Background())
		}
		conn.Release()
	}
	return release, true, nil
}
