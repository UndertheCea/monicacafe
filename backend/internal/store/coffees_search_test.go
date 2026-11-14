package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestListCoffeesSearchFlavorNote: the keyword search (what a flavour-note chip
// on the coffee page links to, #227) finds a coffee by one of its notes.
func TestListCoffeesSearchFlavorNote(t *testing.T) {
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
		u, err := tx.CreateUser(ctx, "note-"+suffix+"@example.test", "x", "s")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "note-" + suffix, Name: "s", City: "台北市"})
		if err != nil {
			return err
		}
		for name, notes := range map[string][]string{"plain": {"巧克力"}, "floral": {"茉莉花", "Peach"}} {
			if _, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: name, Slug: name + "-" + suffix, OriginCountryID: origins[0].ID,
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast, FlavorNotes: notes,
			}); err != nil {
				return err
			}
		}
		for _, term := range []string{"茉莉花", "peach"} {
			f := store.CoffeeFilter{ShopID: &sh.ID, IncludeUnpublished: true, SearchTerms: []string{term}}
			cs, total, err := tx.ListCoffees(ctx, f, store.SortNewest, 10, 0)
			if err != nil {
				return err
			}
			if total != 1 || len(cs) != 1 || cs[0].Name != "floral" {
				t.Errorf("search %q: total %d, want only the floral coffee", term, total)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}

// TestListCoffeesSearchSynonyms: a word finds coffees whose seller wrote it in
// the other language or in traditional characters (#269), and every word must
// still match (AND across words).
func TestListCoffeesSearchSynonyms(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	errRollback := errors.New("rollback")

	err := s.InTx(ctx, func(tx *store.Store) error {
		origins, err := tx.OriginCountries(ctx)
		if err != nil {
			return err
		}
		var ethiopia, colombia string
		for _, o := range origins {
			switch o.NameEn {
			case "Ethiopia":
				ethiopia = o.ID
			case "Colombia":
				colombia = o.ID
			}
		}
		varieties, err := tx.CoffeeVarieties(ctx)
		if err != nil {
			return err
		}
		var geisha string
		for _, v := range varieties {
			if v.Name == "Geisha" {
				geisha = v.ID
			}
		}
		methods, err := tx.ProcessingMethods(ctx)
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "syn-"+suffix+"@example.test", "x", "s")
		if err != nil {
			return err
		}
		sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: "syn-" + suffix, Name: "s", City: "台北市"})
		if err != nil {
			return err
		}
		for _, c := range []struct {
			name, origin, region string
			variety              *string
		}{
			{"yirga", ethiopia, "耶加雪菲", nil},
			{"gesha", colombia, "Huila", &geisha},
		} {
			if _, err := tx.CreateCoffee(ctx, store.CreateCoffeeParams{
				ShopID: sh.ID, Name: c.name, Slug: c.name + "-" + suffix, OriginCountryID: c.origin,
				ProcessingMethodID: methods[0].ID, RoastLevel: lightRoast, Region: c.region, VarietyID: c.variety,
			}); err != nil {
				return err
			}
		}
		for _, tc := range []struct {
			q    []string
			want []string
		}{
			{[]string{"Yirgacheffe"}, []string{"yirga"}},
			{[]string{"埃塞俄比亚"}, []string{"yirga"}},
			{[]string{"瑰夏"}, []string{"gesha"}},
			{[]string{"薇拉", "藝伎"}, []string{"gesha"}},
			{[]string{"薇拉", "Yirgacheffe"}, nil},
		} {
			f := store.CoffeeFilter{ShopID: &sh.ID, IncludeUnpublished: true, SearchTerms: tc.q}
			cs, total, err := tx.ListCoffees(ctx, f, store.SortNewest, 10, 0)
			if err != nil {
				return err
			}
			var got []string
			for _, c := range cs {
				got = append(got, c.Name)
			}
			if total != len(tc.want) || fmt.Sprint(got) != fmt.Sprint(tc.want) {
				t.Errorf("search %q: got %v (total %d), want %v", tc.q, got, total, tc.want)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
