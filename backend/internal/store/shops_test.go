package store_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// testStore connects to TEST_DATABASE_URL (a migrated database) or skips.
func testStore(t *testing.T) *store.Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	return store.New(pool)
}

var errRollback = errors.New("rollback")

func f64(v float64) *float64 { return &v }

func TestShopPins(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	cases := []struct {
		name     string
		lat, lng *float64
		wantPin  bool
	}{
		{"both coordinates", f64(25.0330), f64(121.5654), true},
		{"no coordinates", nil, nil, false},
		{"lat only", f64(24.1477), nil, false},
		{"lng only", nil, f64(120.6736), false},
		{"edge of range", f64(-90), f64(180), true},
	}

	// Everything runs in one transaction that is always rolled back, so a
	// shared dev database is left untouched.
	err := s.InTx(ctx, func(tx *store.Store) error {
		want := map[string]bool{}
		for i, tc := range cases {
			u, err := tx.CreateUser(ctx, fmt.Sprintf("pins-%s-%d@example.test", suffix, i), "x", "pins")
			if err != nil {
				return err
			}
			slug := fmt.Sprintf("pins-%s-%d", suffix, i)
			sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: slug, Name: tc.name, City: "台北市"})
			if err != nil {
				return err
			}
			if tc.lat != nil || tc.lng != nil {
				if _, err := tx.UpdateShop(ctx, sh.ID, store.UpdateShopParams{Lat: tc.lat, Lng: tc.lng}); err != nil {
					return err
				}
			}
			want[slug] = tc.wantPin
		}

		pins, err := tx.ShopPins(ctx)
		if err != nil {
			return err
		}
		got := map[string]*store.ShopPin{}
		for _, p := range pins {
			got[p.Slug] = p
		}
		for i, tc := range cases {
			slug := fmt.Sprintf("pins-%s-%d", suffix, i)
			p, ok := got[slug]
			if ok != want[slug] {
				t.Errorf("%s: pin present = %v, want %v", tc.name, ok, want[slug])
				continue
			}
			if ok && (p.Lat != *tc.lat || p.Lng != *tc.lng || p.City != "台北市" || p.Name != tc.name) {
				t.Errorf("%s: got pin %+v", tc.name, p)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}

func TestShopCoordinateConstraints(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	cases := []struct {
		name     string
		lat, lng *float64
		wantErr  bool
	}{
		{"valid Taipei", f64(25.0330), f64(121.5654), false},
		{"lat too large", f64(90.1), nil, true},
		{"lng too small", nil, f64(-180.5), true},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := s.InTx(ctx, func(tx *store.Store) error {
				u, err := tx.CreateUser(ctx, fmt.Sprintf("coords-%s-%d@example.test", suffix, i), "x", "coords")
				if err != nil {
					return err
				}
				sh, err := tx.CreateShop(ctx, store.CreateShopParams{
					OwnerID: u.ID, Slug: fmt.Sprintf("coords-%s-%d", suffix, i), Name: "c", City: "台北市",
				})
				if err != nil {
					return err
				}
				if _, err := tx.UpdateShop(ctx, sh.ID, store.UpdateShopParams{Lat: tc.lat, Lng: tc.lng}); err != nil {
					return err
				}
				return errRollback
			})
			gotErr := !errors.Is(err, errRollback)
			if gotErr != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}
