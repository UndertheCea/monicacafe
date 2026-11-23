package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestDuplicateCoffeeSource: only a live source is copied (#484). A coffee an
// admin took down, or one archived, is ErrNotFound, so a takedown racing the
// resolver's first read can't yield a clean, unreviewed copy.
func TestDuplicateCoffeeSource(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	cases := []struct {
		name string
		mark string // SQL run on the source first ("" = none)
		want error
	}{
		{"live", "", nil},
		{"taken down", `UPDATE coffees SET is_published = false, removed_at = now() WHERE id = $1`, store.ErrNotFound},
		{"archived", `UPDATE coffees SET is_published = false, archived_at = now() WHERE id = $1`, store.ErrNotFound},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := s.InTx(ctx, func(tx *store.Store) error {
				origins, err := tx.OriginCountries(ctx)
				if err != nil {
					return err
				}
				methods, err := tx.ProcessingMethods(ctx)
				if err != nil {
					return err
				}
				u, err := tx.CreateUser(ctx, fmt.Sprintf("dup-%d-%s@example.test", i, suffix), "x", "d")
				if err != nil {
					return err
				}
				sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: fmt.Sprintf("dup-%d-%s", i, suffix), Name: "d", City: "台北市"})
				if err != nil {
					return err
				}
				co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
					ShopID: sh.ID, Name: "src", Slug: "src-" + suffix, OriginCountryID: origins[0].ID,
					ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
				})
				if err != nil {
					return err
				}
				if tc.mark != "" {
					if _, err := tx.RawDB().Exec(ctx, tc.mark, co.ID); err != nil {
						return err
					}
				}
				cp, err := tx.DuplicateCoffee(ctx, co.ID, "copy", "copy-"+suffix)
				if !errors.Is(err, tc.want) {
					t.Errorf("DuplicateCoffee err = %v, want %v", err, tc.want)
				}
				if tc.want == nil && (cp == nil || cp.RemovedAt != nil || cp.IsPublished) {
					t.Errorf("copy = %+v, want a clean draft", cp)
				}
				return errRollback
			})
			if !errors.Is(err, errRollback) {
				t.Fatal(err)
			}
		})
	}
}
