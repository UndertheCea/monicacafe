package sweep

import (
	"context"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type fakeLocker struct {
	acquired bool
	err      error
	released atomic.Int32
}

func (f *fakeLocker) TryLock(context.Context, int64) (func(), bool, error) {
	if f.err != nil || !f.acquired {
		return nil, false, f.err
	}
	return func() { f.released.Add(1) }, true, nil
}

func TestRunOnce(t *testing.T) {
	boom := errors.New("boom")
	tests := []struct {
		name        string
		locker      *fakeLocker
		run         func(context.Context) (int, error)
		wantOutcome string
		wantDeleted int
		wantRan     bool
		wantRelease int32
	}{
		{"runs and releases", &fakeLocker{acquired: true}, func(context.Context) (int, error) { return 7, nil }, OutcomeOK, 7, true, 1},
		{"another instance holds the lock", &fakeLocker{acquired: false}, func(context.Context) (int, error) { return 1, nil }, OutcomeSkipped, 0, false, 0},
		{"lock error", &fakeLocker{err: boom}, func(context.Context) (int, error) { return 1, nil }, OutcomeError, 0, false, 0},
		{"job error still releases", &fakeLocker{acquired: true}, func(context.Context) (int, error) { return 2, boom }, OutcomeError, 2, true, 1},
	}
	for _, tc := range tests {
		ran := false
		var gotJob, gotOutcome string
		var gotDeleted int
		r := &Runner{Locker: tc.locker, Observe: func(job, outcome string, deleted int) {
			gotJob, gotOutcome, gotDeleted = job, outcome, deleted
		}}
		r.RunOnce(context.Background(), Job{Name: "j", Key: 1, Every: time.Hour, Run: func(ctx context.Context) (int, error) {
			ran = true
			return tc.run(ctx)
		}})
		if ran != tc.wantRan || gotJob != "j" || gotOutcome != tc.wantOutcome || gotDeleted != tc.wantDeleted || tc.locker.released.Load() != tc.wantRelease {
			t.Errorf("%s: ran=%v job=%q outcome=%q deleted=%d released=%d; want ran=%v outcome=%q deleted=%d released=%d",
				tc.name, ran, gotJob, gotOutcome, gotDeleted, tc.locker.released.Load(), tc.wantRan, tc.wantOutcome, tc.wantDeleted, tc.wantRelease)
		}
	}
}

func TestRunOnceSkipsWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := &Runner{Locker: &fakeLocker{acquired: true}, Observe: func(string, string, int) { t.Error("nothing should be observed") }}
	r.RunOnce(ctx, Job{Name: "j", Run: func(context.Context) (int, error) { t.Error("must not run"); return 0, nil }})
}

// TestStartStopsAndIsAwaited: a job that is mid-run when the context is
// cancelled finishes before Wait returns, and nothing runs afterwards.
func TestStartStopsAndIsAwaited(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	var finished, runs atomic.Int32
	r := &Runner{}
	r.Start(ctx, Job{Name: "slow", Every: time.Hour, RunNow: true, Run: func(ctx context.Context) (int, error) {
		runs.Add(1)
		close(started)
		<-ctx.Done()
		time.Sleep(50 * time.Millisecond) // cleanup after cancel
		finished.Add(1)
		return 0, ctx.Err()
	}})
	<-started
	cancel()
	r.Wait()
	if finished.Load() != 1 || runs.Load() != 1 {
		t.Errorf("finished=%d runs=%d; Wait must not return before the running job does", finished.Load(), runs.Load())
	}
}

func TestStartTicks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var mu sync.Mutex
	n := 0
	done := make(chan struct{})
	r := &Runner{}
	r.Start(ctx, Job{Name: "tick", Every: 10 * time.Millisecond, Run: func(context.Context) (int, error) {
		mu.Lock()
		defer mu.Unlock()
		n++
		if n == 3 {
			close(done)
		}
		return 0, nil
	}})
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("job did not run repeatedly")
	}
	cancel()
	r.Wait()
}

// TestPGLockerExcludes uses a real Postgres: while one holder has the lock a
// second TryLock is refused; after release it succeeds.
func TestPGLockerExcludes(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping advisory lock test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	l := PGLocker{Pool: pool}
	const key = 7_221_001 // test-only key, no job uses it

	rel1, ok, err := l.TryLock(ctx, key)
	if err != nil || !ok {
		t.Fatalf("first TryLock = %v, %v", ok, err)
	}
	_, ok, err = l.TryLock(ctx, key)
	if err != nil || ok {
		t.Fatalf("second TryLock while held = %v, %v; want refused", ok, err)
	}
	rel1()
	rel2, ok, err := l.TryLock(ctx, key)
	if err != nil || !ok {
		t.Fatalf("TryLock after release = %v, %v", ok, err)
	}
	rel2()
}
