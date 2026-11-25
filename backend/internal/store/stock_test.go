package store_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestReserveStockConcurrent: 50 buyers race for the last 10 bags; exactly 10
// win and the stock ends at 0, never below (#277). Each reservation runs in
// its own transaction like a checkout will. Rows are committed, then removed.
func TestReserveStockConcurrent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 10)
	defer cleanup()

	var (
		wins, losses atomic.Int32
		wg           sync.WaitGroup
		start        = make(chan struct{})
	)
	for range 50 {
		wg.Go(func() {
			<-start
			err := s.InTx(ctx, func(tx *store.Store) error { return tx.ReserveStock(ctx, v.ID, 1) })
			switch {
			case err == nil:
				wins.Add(1)
			case errors.Is(err, store.ErrInsufficientStock):
				losses.Add(1)
			default:
				t.Errorf("reserve: %v", err)
			}
		})
	}
	close(start)
	wg.Wait()
	if wins.Load() != 10 || losses.Load() != 40 {
		t.Fatalf("wins = %d, losses = %d; want 10 / 40", wins.Load(), losses.Load())
	}
	got, err := s.VariantByID(ctx, v.ID)
	if err != nil || got.Stock != 0 {
		t.Fatalf("stock = %v, %v; want 0", got, err)
	}
}

// TestStockEdits covers ReserveStock / ReleaseStock edge cases and the
// expectedStock guard on seller edits.
func TestStockEdits(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 5)
	defer cleanup()
	ip := func(n int) *int { return &n }
	off := false

	steps := []struct {
		name    string
		run     func() error
		want    error
		stockIs int
	}{
		{"reserve 2", func() error { return s.ReserveStock(ctx, v.ID, 2) }, nil, 3},
		{"reserve more than left", func() error { return s.ReserveStock(ctx, v.ID, 4) }, store.ErrInsufficientStock, 3},
		{"reserve zero is a bug", func() error { return s.ReserveStock(ctx, v.ID, 0) }, errAny, 3},
		{"reserve more than a hold allows", func() error { return s.ReserveStock(ctx, v.ID, store.MaxHoldQuantity+1) }, errAny, 3},
		{"edit with stale expected stock", func() error {
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{Stock: ip(20), ExpectedStock: ip(5)})
			return err
		}, store.ErrStockChanged, 3},
		{"edit with current expected stock", func() error {
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{Stock: ip(20), ExpectedStock: ip(3)})
			return err
		}, nil, 20},
		{"edit without expected stock still works", func() error {
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{Stock: ip(8)})
			return err
		}, nil, 8},
		{"release 2", func() error { return s.ReleaseStock(ctx, v.ID, 2) }, nil, 10},
		{"mark unavailable", func() error {
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{IsAvailable: &off})
			return err
		}, nil, 10},
		{"unavailable can't be reserved", func() error { return s.ReserveStock(ctx, v.ID, 1) }, store.ErrInsufficientStock, 10},
		{"unknown variant", func() error {
			_, err := s.UpdateVariant(ctx, "00000000-0000-0000-0000-000000000000", store.UpdateVariantParams{Stock: ip(1), ExpectedStock: ip(0)})
			return err
		}, store.ErrNotFound, 10},
		{"available again", func() error {
			on := true
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{IsAvailable: &on})
			return err
		}, nil, 10},
		// #514: a NT$0 row stored before #358 reads sold out everywhere, so it can't be bought either.
		{"NT$0 can't be reserved", func() error {
			if _, err := s.RawDB().Exec(ctx, `UPDATE variants SET price_twd = 0 WHERE id = $1`, v.ID); err != nil {
				return err
			}
			return s.ReserveStock(ctx, v.ID, 1)
		}, store.ErrInsufficientStock, 10},
		{"NT$1 can", func() error {
			if _, err := s.RawDB().Exec(ctx, `UPDATE variants SET price_twd = 1 WHERE id = $1`, v.ID); err != nil {
				return err
			}
			return s.ReserveStock(ctx, v.ID, 1)
		}, nil, 9},
	}
	for _, st := range steps {
		err := st.run()
		switch {
		case st.want == errAny:
			if err == nil {
				t.Fatalf("%s: no error", st.name)
			}
		case !errors.Is(err, st.want) && !(err == nil && st.want == nil):
			t.Fatalf("%s: err = %v, want %v", st.name, err, st.want)
		}
		got, err := s.VariantByID(ctx, v.ID)
		if err != nil || got.Stock != st.stockIs {
			t.Fatalf("%s: stock = %+v, %v; want %d", st.name, got, err, st.stockIs)
		}
	}
}

var errAny = errors.New("any error")

// committedVariant creates (and commits) a seller, shop, coffee and one
// variant with the given stock; cleanup deletes them.
func committedVariant(t *testing.T, s *store.Store, stock int) (*store.Variant, func()) {
	t.Helper()
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	origins, err := s.OriginCountries(ctx)
	if err != nil {
		t.Fatal(err)
	}
	methods, err := s.ProcessingMethods(ctx)
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "stock-"+suffix+"@example.test", "x", "s")
	if err != nil {
		t.Fatal(err)
	}
	cleanup := func() {
		db := s.RawDB()
		_, _ = db.Exec(ctx, `DELETE FROM shops WHERE owner_id = $1`, u.ID)
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID)
	}
	sh, err := s.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "stock-" + suffix, Name: "s", City: "台北市"})
	if err != nil {
		cleanup()
		t.Fatal(err)
	}
	co, err := s.CreateCoffee(ctx, store.CreateCoffeeParams{
		ShopID: sh.ID, Name: "s", Slug: "s-" + suffix, OriginCountryID: origins[0].ID,
		ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
	})
	if err != nil {
		cleanup()
		t.Fatal(err)
	}
	v, err := s.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "WHOLE_BEAN", WeightG: 200, PriceTWD: 450, Stock: stock})
	if err != nil {
		cleanup()
		t.Fatal(err)
	}
	// Published, so buyers could see it and ReserveStock may take from it (#326).
	if _, err := s.RawDB().Exec(ctx, `UPDATE coffees SET is_published = true WHERE id = $1`, co.ID); err != nil {
		cleanup()
		t.Fatal(err)
	}
	return v, cleanup
}

// TestReserveStockOnlyPublic (#326): stock is taken only from coffees buyers
// can see. A draft, a taken-down coffee and a suspended shop all answer
// ErrInsufficientStock and keep their stock; restoring the shop allows it again.
func TestReserveStockOnlyPublic(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 5)
	defer cleanup()
	db := s.RawDB()
	exec := func(q string) func() {
		return func() {
			if _, err := db.Exec(ctx, q, v.CoffeeID); err != nil {
				t.Fatal(err)
			}
		}
	}
	shopOf := `(SELECT shop_id FROM coffees WHERE id = $1)`
	steps := []struct {
		name  string
		setup func()
		want  error
	}{
		{"draft", exec(`UPDATE coffees SET is_published = false WHERE id = $1`), store.ErrInsufficientStock},
		{"published again", exec(`UPDATE coffees SET is_published = true WHERE id = $1`), nil},
		{"taken down", exec(`UPDATE coffees SET is_published = false, removed_at = now() WHERE id = $1`), store.ErrInsufficientStock},
		{"restored", exec(`UPDATE coffees SET is_published = true, removed_at = NULL WHERE id = $1`), nil},
		{"shop suspended", exec(`UPDATE shops SET suspended_at = now() WHERE id = ` + shopOf), store.ErrInsufficientStock},
		{"shop restored", exec(`UPDATE shops SET suspended_at = NULL WHERE id = ` + shopOf), nil},
	}
	stock := 5
	for _, st := range steps {
		st.setup()
		err := s.ReserveStock(ctx, v.ID, 1)
		if !errors.Is(err, st.want) {
			t.Fatalf("%s: err = %v, want %v", st.name, err, st.want)
		}
		if err == nil {
			stock--
		}
		got, err := s.VariantByID(ctx, v.ID)
		if err != nil {
			t.Fatal(err)
		}
		if got.Stock != stock {
			t.Fatalf("%s: stock = %d, want %d", st.name, got.Stock, stock)
		}
	}
}
