package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestStockOnlyChangesLeaveCoffeeAlone (#290): taking or giving back stock
// doesn't rewrite (or lock) the parent coffee, so coffees.updated_at stays;
// a price change still moves it. Each step commits on its own, like checkouts.
func TestStockOnlyChangesLeaveCoffeeAlone(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	v, cleanup := committedVariant(t, s, 10)
	defer cleanup()
	updatedAt := func() time.Time {
		t.Helper()
		co, err := s.CoffeeByID(ctx, v.CoffeeID)
		if err != nil {
			t.Fatal(err)
		}
		return co.UpdatedAt
	}
	price := int64(480)
	steps := []struct {
		name  string
		run   func() error
		moves bool
	}{
		{"reserve", func() error { return s.ReserveStock(ctx, v.ID, 2) }, false},
		{"release", func() error { return s.ReleaseStock(ctx, v.ID, 1) }, false},
		{"price change", func() error {
			_, err := s.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{PriceTWD: &price})
			return err
		}, true},
	}
	prev := updatedAt()
	for _, st := range steps {
		time.Sleep(10 * time.Millisecond)
		if err := st.run(); err != nil {
			t.Fatalf("%s: %v", st.name, err)
		}
		now := updatedAt()
		if moved := now.After(prev); moved != st.moves {
			t.Fatalf("%s: coffee updated_at %v → %v, moved = %v; want %v", st.name, prev, now, moved, st.moves)
		}
		prev = now
	}
}

// TestShopCoffeeIDsSkipArchived (#290): an archived coffee isn't part of the
// line-up a reorder must match.
func TestShopCoffeeIDsSkipArchived(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	errRollback := errors.New("rollback")
	err := s.InTx(ctx, func(tx *store.Store) error {
		origins, err := tx.OriginCountries(ctx)
		if err != nil {
			return err
		}
		methods, err := tx.ProcessingMethods(ctx)
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "lineup-"+suffix+"@example.test", "x", "l")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "lineup-" + suffix, Name: "l", City: "台北市"})
		if err != nil {
			return err
		}
		var ids []string
		for _, name := range []string{"kept", "archived"} {
			co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: name, Slug: name + "-" + suffix, OriginCountryID: origins[0].ID,
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
			})
			if err != nil {
				return err
			}
			ids = append(ids, co.ID)
		}
		if _, err := tx.RawDB().Exec(ctx, `UPDATE coffees SET archived_at = now() WHERE id = $1`, ids[1]); err != nil {
			return err
		}
		got, err := tx.ShopCoffeeIDsForUpdate(ctx, sh.ID)
		if err != nil {
			return err
		}
		if len(got) != 1 || got[0] != ids[0] {
			t.Errorf("line-up = %v; want only %s", got, ids[0])
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
