package graph

import (
	"context"
	"errors"
	"sync"
	"testing"
)

func TestOnceLoader(t *testing.T) {
	boom := errors.New("boom")
	cases := []struct {
		name    string
		val     int
		err     error
		callers int
	}{
		{"value shared by every caller", 7, nil, 5},
		{"error shared too (no retry within a request)", 0, boom, 3},
		{"single caller", 1, nil, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var (
				mu    sync.Mutex
				calls int
			)
			load := onceLoader(func(context.Context) (int, error) {
				mu.Lock()
				calls++
				mu.Unlock()
				return tc.val, tc.err
			})
			var wg sync.WaitGroup
			for range tc.callers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					v, err := load(context.Background())
					if v != tc.val || !errors.Is(err, tc.err) {
						t.Errorf("got (%d, %v), want (%d, %v)", v, err, tc.val, tc.err)
					}
				}()
			}
			wg.Wait()
			if calls != 1 {
				t.Fatalf("load ran %d times, want 1", calls)
			}
		})
	}
}
