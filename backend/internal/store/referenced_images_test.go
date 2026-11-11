package store_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestReferencedImageKeys: of a page of bucket keys, only those a shop logo /
// banner or a coffee gallery points at come back; malformed keys and keys
// under another listing's ID do not.
func TestReferencedImageKeys(t *testing.T) {
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
		u, err := tx.CreateUser(ctx, "refimg-"+suffix+"@example.test", "x", "s")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "refimg-" + suffix, Name: "s", City: "台北市"})
		if err != nil {
			return err
		}
		co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
			ShopID: sh.ID, Name: "c", Slug: "refimg-" + suffix, OriginCountryID: origins[0].ID, ProcessingMethodID: methods[0].ID,
		})
		if err != nil {
			return err
		}
		hex := func(n int) string { return fmt.Sprintf("%024x", n) }
		logo := "shops/" + sh.ID + "/logo-" + hex(1) + ".jpg"
		banner := "shops/" + sh.ID + "/banner-" + hex(2) + ".png"
		strayShop := "shops/" + sh.ID + "/logo-" + hex(3) + ".jpg"
		photo := "coffees/" + co.ID + "/photo-" + hex(4) + ".webp"
		strayCoffee := "coffees/" + co.ID + "/photo-" + hex(5) + ".webp"
		otherShop := "shops/00000000-0000-4000-8000-000000000000/logo-" + hex(1) + ".jpg"

		base := "http://localhost/media/"
		if _, err := tx.UpdateShop(ctx, sh.ID, store.UpdateShopParams{LogoURL: ptr(base + logo), BannerURL: ptr(base + banner)}); err != nil {
			return err
		}
		if _, err := tx.UpdateCoffee(ctx, co.ID, store.UpdateCoffeeParams{ImageURLs: []string{base + photo}}); err != nil {
			return err
		}

		got, err := tx.ReferencedImageKeys(ctx, []string{logo, banner, strayShop, photo, strayCoffee, otherShop, "shops/not-a-uuid/x.jpg", ""})
		if err != nil {
			return err
		}
		slices.Sort(got)
		want := []string{banner, logo, photo}
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Errorf("referenced = %v, want %v", got, want)
		}
		if got, err := tx.ReferencedImageKeys(ctx, nil); err != nil || len(got) != 0 {
			t.Errorf("no keys: %v, %v", got, err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}

func ptr[T any](v T) *T { return &v }
