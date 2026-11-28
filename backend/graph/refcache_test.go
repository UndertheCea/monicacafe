package graph

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

// fakeRefs is a scripted loader: each call returns the next result.
type fakeRefs struct {
	mu      sync.Mutex
	results []error // nil = success with a snapshot named after the call number
	calls   int
}

func (f *fakeRefs) load(context.Context) (*refSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if err := f.results[f.calls-1]; err != nil {
		return nil, err
	}
	id := string(rune('0' + f.calls))
	o := &model.OriginCountry{ID: id}
	return &refSnapshot{origins: []*model.OriginCountry{o}, originBy: map[string]*model.OriginCountry{id: o}}, nil
}

func TestRefCacheGet(t *testing.T) {
	boom := errors.New("db down")
	type call struct {
		at     time.Duration // since the start
		wantID string        // "" = want an error
		wantN  int           // loader calls so far
	}
	cases := []struct {
		name    string
		results []error
		calls   []call
	}{
		{"cold failure is an error, then a success loads", []error{boom, nil},
			[]call{{0, "", 1}, {time.Second, "2", 2}}},
		{"warm cache is served within the TTL", []error{nil},
			[]call{{0, "1", 1}, {refTTL, "1", 1}}},
		{"expired cache reloads", []error{nil, nil},
			[]call{{0, "1", 1}, {refTTL + time.Second, "2", 2}}},
		{"failed reload serves the old snapshot and backs off", []error{nil, boom, nil},
			[]call{
				{0, "1", 1},
				{refTTL + time.Second, "1", 2},              // reload fails: stale served
				{refTTL + time.Second + refRetry/2, "1", 2}, // inside the back-off: no new query
				{refTTL + 2*time.Second + refRetry, "3", 3}, // retried and succeeded (third load)
			}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeRefs{results: tc.results}
			start := time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC)
			var now time.Time
			c := &refCache{load: f.load, now: func() time.Time { return now }}
			for i, cl := range tc.calls {
				now = start.Add(cl.at)
				snap, err := c.get(context.Background())
				switch {
				case cl.wantID == "" && err == nil:
					t.Fatalf("call %d: want an error, got %v", i, snap.origins[0].ID)
				case cl.wantID != "" && err != nil:
					t.Fatalf("call %d: %v", i, err)
				case cl.wantID != "" && snap.origins[0].ID != cl.wantID:
					t.Fatalf("call %d: snapshot %s, want %s", i, snap.origins[0].ID, cl.wantID)
				}
				if f.calls != cl.wantN {
					t.Fatalf("call %d: %d loads, want %d", i, f.calls, cl.wantN)
				}
			}
		})
	}
}

// A warm cache never makes readers wait for a slow reload (#575).
func TestRefCacheWarmReadersDontWait(t *testing.T) {
	release := make(chan struct{})
	entered := make(chan struct{})
	first := true
	o := &model.OriginCountry{ID: "old"}
	old := &refSnapshot{origins: []*model.OriginCountry{o}}
	var now time.Time
	c := &refCache{now: func() time.Time { return now }}
	c.load = func(context.Context) (*refSnapshot, error) {
		if first {
			first = false
			return old, nil
		}
		close(entered)
		<-release
		return old, nil
	}
	if _, err := c.get(context.Background()); err != nil {
		t.Fatal(err)
	}
	now = now.Add(refTTL + time.Second)
	done := make(chan struct{})
	go func() { _, _ = c.get(context.Background()); close(done) }()
	<-entered
	snap, err := c.get(context.Background()) // must not block on the reload above
	if err != nil || snap != old {
		t.Fatalf("got %v, %v; want the old snapshot", snap, err)
	}
	close(release)
	<-done
}
