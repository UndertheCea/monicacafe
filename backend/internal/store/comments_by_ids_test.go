package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

func TestCommentsByIDsEmptyNoDB(t *testing.T) {
	// A zero Store has no pool: any query would panic, so this proves empty
	// input returns before touching the database.
	for _, ids := range [][]string{nil, {}} {
		m, err := (&store.Store{}).CommentsByIDs(context.Background(), ids)
		if err != nil || m == nil || len(m) != 0 {
			t.Fatalf("ids=%v: got %v, %v; want empty map", ids, m, err)
		}
	}
}

func TestCommentsByIDs(t *testing.T) {
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
		owner, err := tx.CreateUser(ctx, fmt.Sprintf("cbi-own-%s@example.test", suffix), "x", "o")
		if err != nil {
			return err
		}
		shop, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: owner.ID, Slug: "cbi-" + suffix, Name: "cbi", City: "台南市"})
		if err != nil {
			return err
		}
		co, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
			ShopID: shop.ID, Name: "c", Slug: "cbi-c-" + suffix, OriginCountryID: origins[0].ID,
			ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast,
		})
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, fmt.Sprintf("cbi-%s@example.test", suffix), "x", "c")
		if err != nil {
			return err
		}
		var ids []string
		for i := range 2 {
			c, err := tx.CreateComment(ctx, u.ID, co.ID, fmt.Sprintf("body %d", i))
			if err != nil {
				return err
			}
			ids = append(ids, c.ID)
		}
		const missing = "00000000-0000-4000-8000-000000000000"
		tests := []struct {
			name string
			in   []string
			want []string
		}{
			{"two existing", []string{ids[0], ids[1]}, ids},
			{"missing absent", []string{ids[0], missing}, ids[:1]},
			{"duplicates", []string{ids[1], ids[1], ids[1]}, ids[1:]},
			{"only missing", []string{missing}, nil},
			{"empty", nil, nil},
		}
		for _, tc := range tests {
			got, err := tx.CommentsByIDs(ctx, tc.in)
			if err != nil {
				t.Fatalf("%s: %v", tc.name, err)
			}
			if len(got) != len(tc.want) {
				t.Errorf("%s: got %d comments, want %d", tc.name, len(got), len(tc.want))
			}
			for _, id := range tc.want {
				want, err := tx.CommentByID(ctx, id)
				if err != nil {
					return err
				}
				g := got[id]
				if g == nil || g.ID != want.ID || g.Body != want.Body || g.UserID != want.UserID ||
					g.CoffeeID != want.CoffeeID || g.FromShop != want.FromShop {
					t.Errorf("%s: comment %s = %+v, want %+v", tc.name, id, g, want)
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
