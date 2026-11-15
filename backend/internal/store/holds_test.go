package store_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

func stockOf(t *testing.T, s *store.Store, id string) int {
	t.Helper()
	v, err := s.VariantByID(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return v.Stock
}

func dropHolds(s *store.Store, ids ...string) {
	_, _ = s.RawDB().Exec(context.Background(), `DELETE FROM stock_holds WHERE variant_id = ANY($1::uuid[])`, ids)
}

// TestReserveLinesAndRelease (#310): a whole order is taken or nothing is;
// each hold gives its bags back exactly once.
func TestReserveLinesAndRelease(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a, cleanA := committedVariant(t, s, 5)
	defer cleanA()
	b, cleanB := committedVariant(t, s, 2)
	defer cleanB()
	defer dropHolds(s, a.ID, b.ID)

	// b is short: nothing is taken from a either.
	if _, err := s.ReserveLines(ctx, []store.StockLine{{VariantID: a.ID, Quantity: 2}, {VariantID: b.ID, Quantity: 3}}); !errors.Is(err, store.ErrInsufficientStock) {
		t.Fatalf("short order: err = %v", err)
	}
	if stockOf(t, s, a.ID) != 5 || stockOf(t, s, b.ID) != 2 {
		t.Fatalf("a short order took stock: a=%d b=%d", stockOf(t, s, a.ID), stockOf(t, s, b.ID))
	}

	holds, err := s.ReserveLines(ctx, []store.StockLine{{VariantID: b.ID, Quantity: 2}, {VariantID: a.ID, Quantity: 3}})
	if err != nil || len(holds) != 2 {
		t.Fatalf("reserve: %v, %v", holds, err)
	}
	if stockOf(t, s, a.ID) != 2 || stockOf(t, s, b.ID) != 0 {
		t.Fatalf("after reserve: a=%d b=%d; want 2 / 0", stockOf(t, s, a.ID), stockOf(t, s, b.ID))
	}

	steps := []struct {
		name         string
		hold         string
		wantReleased bool
		wantErr      error
		wantA, wantB int
	}{
		{"release b's hold", holds[0], true, nil, 2, 2},
		{"release b's hold again: no-op", holds[0], false, nil, 2, 2},
		{"release a's hold", holds[1], true, nil, 5, 2},
		{"unknown hold", "00000000-0000-0000-0000-000000000000", false, store.ErrNotFound, 5, 2},
	}
	for _, st := range steps {
		released, err := s.ReleaseHold(ctx, st.hold)
		if released != st.wantReleased || !errors.Is(err, st.wantErr) {
			t.Fatalf("%s: released = %v, err = %v", st.name, released, err)
		}
		if ga, gb := stockOf(t, s, a.ID), stockOf(t, s, b.ID); ga != st.wantA || gb != st.wantB {
			t.Fatalf("%s: a=%d b=%d; want %d / %d", st.name, ga, gb, st.wantA, st.wantB)
		}
	}

	// Concurrent duplicate releases of one hold return the bags once.
	holds, err = s.ReserveLines(ctx, []store.StockLine{{VariantID: a.ID, Quantity: 4}})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 10 {
		wg.Go(func() {
			if _, err := s.ReleaseHold(ctx, holds[0]); err != nil {
				t.Errorf("release: %v", err)
			}
		})
	}
	wg.Wait()
	if got := stockOf(t, s, a.ID); got != 5 {
		t.Fatalf("after 10 concurrent releases stock = %d, want 5", got)
	}
}

// TestReserveLinesNoDeadlock (#310): two buyers with the same two options in
// opposite cart order, repeated, each in its own transaction: never a
// deadlock, and the stock adds up.
func TestReserveLinesNoDeadlock(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a, cleanA := committedVariant(t, s, 1000)
	defer cleanA()
	b, cleanB := committedVariant(t, s, 1000)
	defer cleanB()
	defer dropHolds(s, a.ID, b.ID)

	const rounds = 40
	var wg sync.WaitGroup
	for range rounds {
		for _, lines := range [][]store.StockLine{
			{{VariantID: a.ID, Quantity: 1}, {VariantID: b.ID, Quantity: 1}},
			{{VariantID: b.ID, Quantity: 1}, {VariantID: a.ID, Quantity: 1}},
		} {
			wg.Go(func() {
				err := s.InTx(ctx, func(tx *store.Store) error {
					_, err := tx.ReserveLines(ctx, lines)
					return err
				})
				if err != nil {
					t.Errorf("reserve: %v", err)
				}
			})
		}
	}
	wg.Wait()
	if ga, gb := stockOf(t, s, a.ID), stockOf(t, s, b.ID); ga != 1000-2*rounds || gb != 1000-2*rounds {
		t.Fatalf("stock a=%d b=%d; want %d each", ga, gb, 1000-2*rounds)
	}
}
