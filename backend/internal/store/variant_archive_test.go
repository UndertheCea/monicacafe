package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestVariantArchive covers migration 020 (#278): updated_at moves only on a
// real change, a variant / coffee that something references is archived
// instead of deleted, and archived rows drop out of every read. A temporary
// table stands in for Stage 2's order lines (ON DELETE RESTRICT).
func TestVariantArchive(t *testing.T) {
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
		u, err := tx.CreateUser(ctx, "archive-"+suffix+"@example.test", "x", "a")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "archive-" + suffix, Name: "a", City: "台北市"})
		if err != nil {
			return err
		}
		newCoffee := func(slug string) (*store.Coffee, error) {
			return tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: slug, Slug: slug + "-" + suffix, OriginCountryID: origins[0].ID,
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
			})
		}
		co, err := newCoffee("kept")
		if err != nil {
			return err
		}
		v, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "WHOLE_BEAN", WeightG: 200, PriceTWD: 450, Stock: 3})
		if err != nil {
			return err
		}
		free, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "FINE", WeightG: 200, PriceTWD: 450, Stock: 3})
		if err != nil {
			return err
		}

		// updated_at: unchanged by a no-op update, moved by a price change.
		same, err := tx.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{})
		if err != nil {
			return err
		}
		if !same.UpdatedAt.Equal(v.UpdatedAt) {
			return fmt.Errorf("no-op update moved updated_at: %v → %v", v.UpdatedAt, same.UpdatedAt)
		}
		price := int64(480)
		changed, err := tx.UpdateVariant(ctx, v.ID, store.UpdateVariantParams{PriceTWD: &price})
		if err != nil {
			return err
		}
		if !changed.UpdatedAt.After(v.UpdatedAt) {
			return fmt.Errorf("price change kept updated_at %v", changed.UpdatedAt)
		}

		// A plain table (temporary ones can't reference variants), dropped with
		// the rolled-back transaction.
		standIn := "order_line_stand_in_" + suffix
		if _, err := tx.RawDB().Exec(ctx, `CREATE TABLE `+standIn+` (
			variant_id uuid NOT NULL REFERENCES variants(id) ON DELETE RESTRICT)`); err != nil {
			return err
		}
		if _, err := tx.RawDB().Exec(ctx, `INSERT INTO `+standIn+` VALUES ($1)`, v.ID); err != nil {
			return err
		}

		cases := []struct {
			name         string
			id           string
			wantArchived bool
		}{
			{"unreferenced variant is deleted", free.ID, false},
			{"referenced variant is archived", v.ID, true},
		}
		for _, c := range cases {
			archived, err := tx.DeleteVariant(ctx, c.id)
			if err != nil || archived != c.wantArchived {
				return fmt.Errorf("%s: archived = %v, err = %v", c.name, archived, err)
			}
			if _, err := tx.VariantByID(ctx, c.id); !errors.Is(err, store.ErrNotFound) {
				return fmt.Errorf("%s: VariantByID = %v, want ErrNotFound", c.name, err)
			}
			if _, err := tx.DeleteVariant(ctx, c.id); !errors.Is(err, store.ErrNotFound) {
				return fmt.Errorf("%s: second delete = %v, want ErrNotFound", c.name, err)
			}
		}
		if n, err := tx.CountVariants(ctx, co.ID); err != nil || n != 0 {
			return fmt.Errorf("live variants = %d, %v; want 0", n, err)
		}
		if vs, err := tx.VariantsByCoffeeIDs(ctx, []string{co.ID}); err != nil || len(vs[co.ID]) != 0 {
			return fmt.Errorf("VariantsByCoffeeIDs = %v, %v; want none", vs[co.ID], err)
		}
		// The archived row is still there for the reference, and unavailable.
		var avail bool
		if err := tx.RawDB().QueryRow(ctx, `SELECT is_available FROM variants WHERE id = $1 AND archived_at IS NOT NULL`, v.ID).Scan(&avail); err != nil || avail {
			return fmt.Errorf("archived row: available = %v, err = %v", avail, err)
		}
		// Grind + weight are free again for a new live option.
		if _, err := tx.AddVariant(ctx, co.ID, store.CreateVariantParams{Grind: "WHOLE_BEAN", WeightG: 200, PriceTWD: 500, Stock: 1}); err != nil {
			return fmt.Errorf("re-adding an archived option's grind + weight: %w", err)
		}

		// A coffee whose (archived) variant is referenced is archived as a whole.
		archived, err := tx.DeleteCoffee(ctx, co.ID)
		if err != nil || !archived {
			return fmt.Errorf("DeleteCoffee referenced: archived = %v, err = %v", archived, err)
		}
		if _, err := tx.CoffeeByID(ctx, co.ID); !errors.Is(err, store.ErrNotFound) {
			return fmt.Errorf("CoffeeByID archived = %v, want ErrNotFound", err)
		}
		if n, err := tx.CountShopCoffees(ctx, sh.ID); err != nil || n != 0 {
			return fmt.Errorf("CountShopCoffees = %d, %v; want 0", n, err)
		}
		mine, _, err := tx.ListCoffees(ctx, store.CoffeeFilter{ShopID: &sh.ID, IncludeUnpublished: true}, store.SortNewest, 10, 0)
		if err != nil || len(mine) != 0 {
			return fmt.Errorf("owner list = %d coffees, %v; want 0", len(mine), err)
		}

		// A coffee nothing references is really deleted.
		gone, err := newCoffee("gone")
		if err != nil {
			return err
		}
		if archived, err := tx.DeleteCoffee(ctx, gone.ID); err != nil || archived {
			return fmt.Errorf("DeleteCoffee free: archived = %v, err = %v", archived, err)
		}
		var n int
		if err := tx.RawDB().QueryRow(ctx, `SELECT count(*) FROM coffees WHERE id = $1`, gone.ID).Scan(&n); err != nil || n != 0 {
			return fmt.Errorf("deleted coffee rows = %d, %v", n, err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
