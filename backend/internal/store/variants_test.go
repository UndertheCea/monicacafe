package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestVariantStore checks the variant CRUD queries and migration 004's unique
// (coffee, grind, weight) index. Runs inside a rolled-back transaction; the
// constraint-violation case goes last because it aborts the transaction.
func TestVariantStore(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	err := s.InTx(ctx, func(tx *store.Store) error {
		origins, err := tx.OriginCountries(ctx)
		if err != nil {
			return err
		}
		methods, err := tx.ProcessingMethods(ctx)
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "variants-"+suffix+"@example.test", "x", "v")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "variants-" + suffix, Name: "v", City: "台北市"})
		if err != nil {
			return err
		}
		co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
			ShopID: sh.ID, Name: "v", Slug: "v-" + suffix, OriginCountryID: origins[0].ID,
			ProcessingMethodID: methods[0].ID, RoastLevel: "LIGHT",
		})
		if err != nil {
			return err
		}

		v, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "WHOLE_BEAN", WeightG: 200, PriceTWD: 450, Stock: 3})
		if err != nil {
			return err
		}
		if _, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "FINE", WeightG: 200, PriceTWD: 450, Stock: 3}); err != nil {
			return fmt.Errorf("same weight, other grind should be allowed: %w", err)
		}
		if n, err := tx.CountVariants(ctx, co.ID); err != nil || n != 2 {
			return fmt.Errorf("count = %d, %v", n, err)
		}
		if published, err := tx.LockCoffee(ctx, co.ID); err != nil || published {
			return fmt.Errorf("LockCoffee = %v, %v", published, err)
		}

		price, stock, avail := int64(520), 0, false
		updates := []struct {
			name  string
			p     store.UpdateVariantParams
			check func(*store.Variant) bool
		}{
			{"price", store.UpdateVariantParams{PriceTWD: &price}, func(v *store.Variant) bool { return v.PriceTWD == 520 && v.Stock == 3 }},
			{"stock", store.UpdateVariantParams{Stock: &stock}, func(v *store.Variant) bool { return v.Stock == 0 && v.PriceTWD == 520 }},
			{"availability", store.UpdateVariantParams{IsAvailable: &avail}, func(v *store.Variant) bool { return !v.IsAvailable && v.PriceTWD == 520 }},
		}
		for _, u := range updates {
			got, err := tx.UpdateVariant(ctx, v.ID, u.p)
			if err != nil {
				return fmt.Errorf("%s: %w", u.name, err)
			}
			if !u.check(got) {
				return fmt.Errorf("%s: unexpected %+v", u.name, got)
			}
		}

		if err := tx.DeleteVariant(ctx, v.ID); err != nil {
			return err
		}
		if err := tx.DeleteVariant(ctx, v.ID); !errors.Is(err, store.ErrNotFound) {
			return fmt.Errorf("second delete: err = %v, want ErrNotFound", err)
		}
		if _, err := tx.VariantByID(ctx, v.ID); !errors.Is(err, store.ErrNotFound) {
			return fmt.Errorf("VariantByID after delete: %v", err)
		}

		_, err = tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "FINE", WeightG: 200, PriceTWD: 1, Stock: 1})
		if !errors.Is(err, store.ErrConflict) || store.ViolatedConstraint(err) != "variants_coffee_grind_weight_key" {
			return fmt.Errorf("duplicate grind+weight: err = %v, want ErrConflict on the unique index", err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
