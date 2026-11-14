package jobs

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

// A no-op job goes in, a started client runs it, and it ends up completed; the
// client then stops cleanly. Also checks that migrations/021_river_queue.sql
// left the schema in the state River expects. Requires TEST_DATABASE_URL.
func TestNoopJobEndToEnd(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		t.Fatal(err)
	}
	if res, err := migrator.Validate(ctx, nil); err != nil || !res.OK {
		t.Fatalf("River schema not migrated: err=%v result=%+v", err, res)
	}

	client, err := NewClient(pool, 2)
	if err != nil {
		t.Fatal(err)
	}
	events, unsubscribe := client.Subscribe(river.EventKindJobCompleted)
	defer unsubscribe()

	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	res, err := client.Insert(ctx, NoopArgs{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	id := res.Job.ID

	// Other jobs may be in the table (a shared test DB), so wait for ours.
	for done := false; !done; {
		select {
		case ev := <-events:
			done = ev.Job.ID == id
		case <-ctx.Done():
			t.Fatalf("job %d not completed in time", id)
		}
	}

	var state string
	if err := pool.QueryRow(ctx, "SELECT state FROM river_job WHERE id = $1", id).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "completed" {
		t.Fatalf("state = %q, want completed", state)
	}

	stopCtx, stopCancel := context.WithTimeout(ctx, 10*time.Second)
	defer stopCancel()
	if err := client.Stop(stopCtx); err != nil {
		t.Fatalf("stop: %v", err)
	}
}
