package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

// Integration tests run against a migrated database when
// MONICA_TEST_DATABASE_URL is set (e.g. the docker compose Postgres with
// migrations/001_initial.sql applied); otherwise they are skipped.
func testStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("MONICA_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("MONICA_TEST_DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return New(pool), pool
}

type fixture struct {
	userID, shopID, shopSlug string
	pubID, draftID, otherID  string
	originID, washedID       string
}

func seed(t *testing.T, pool *pgxpool.Pool) fixture {
	t.Helper()
	ctx := context.Background()
	sfx := fmt.Sprintf("%d", time.Now().UnixNano())
	var f fixture
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(pool.QueryRow(ctx, `SELECT id::text FROM origin_countries WHERE name_en='Ethiopia'`).Scan(&f.originID))
	must(pool.QueryRow(ctx, `SELECT id::text FROM processing_methods ORDER BY name_en LIMIT 1`).Scan(&f.washedID))
	must(pool.QueryRow(ctx, `INSERT INTO users (email, password_hash, display_name, role)
		VALUES ($1, 'x', '測試賣家', 'SELLER') RETURNING id::text`, "seller"+sfx+"@test.tw").Scan(&f.userID))
	f.shopSlug = "test-shop-" + sfx
	must(pool.QueryRow(ctx, `INSERT INTO shops (owner_id, slug, name, city, lat, lng)
		VALUES ($1::uuid, $2, '測試烘豆所', 'ZZ-測試市', 25.03, 121.56) RETURNING id::text`,
		f.userID, f.shopSlug).Scan(&f.shopID))
	ins := func(name, origin string, pub bool, notes []string) string {
		var id string
		must(pool.QueryRow(ctx, `INSERT INTO coffees (shop_id, name, slug, origin_country_id,
			processing_method_id, roast_level, flavor_notes, is_published)
			VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, 'LIGHT', $6, $7) RETURNING id::text`,
			f.shopID, name, name+"-"+sfx, origin, f.washedID, notes, pub).Scan(&id))
		return id
	}
	var otherOrigin string
	must(pool.QueryRow(ctx, `SELECT id::text FROM origin_countries WHERE name_en <> 'Ethiopia' LIMIT 1`).Scan(&otherOrigin))
	f.pubID = ins("yirgacheffe", f.originID, true, []string{"Jasmine", "Bergamot"})
	f.draftID = ins("draft", f.originID, false, []string{"Jasmine"})
	f.otherID = ins("other", otherOrigin, true, []string{"Chocolate"})
	must(exec(ctx, pool, `INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock)
		VALUES ($1::uuid, 'WHOLE_BEAN', 200, 450, 10), ($1::uuid, 'FINE', 200, 480, 0),
		       ($2::uuid, 'WHOLE_BEAN', 227, 900, 5)`, f.pubID, f.otherID))
	must(exec(ctx, pool, `INSERT INTO comments (user_id, coffee_id, body) VALUES ($1::uuid, $2::uuid, '好喝！')`,
		f.userID, f.otherID))
	t.Cleanup(func() {
		_ = exec(ctx, pool, `DELETE FROM shops WHERE id = $1::uuid`, f.shopID)
		_ = exec(ctx, pool, `DELETE FROM users WHERE id = $1::uuid`, f.userID)
	})
	return f
}

func exec(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) error {
	_, err := pool.Exec(ctx, sql, args...)
	return err
}

func TestIntegrationCoffees(t *testing.T) {
	s, pool := testStore(t)
	f := seed(t, pool)
	ctx := context.Background()

	tests := []struct {
		name    string
		filter  *model.CoffeeFilter
		wantIDs []string
	}{
		{"all published in shop", nil, []string{f.otherID, f.pubID}},
		{"origin", &model.CoffeeFilter{OriginCountryID: &f.originID}, []string{f.pubID}},
		{"flavor note case-insensitive", &model.CoffeeFilter{FlavorNote: ptr("jasm")}, []string{f.pubID}},
		{"price range", &model.CoffeeFilter{MinPriceTwd: ptr(400), MaxPriceTwd: ptr(500)}, []string{f.pubID}},
		{"price too high", &model.CoffeeFilter{MinPriceTwd: ptr(1000)}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, total, err := s.ListCoffees(ctx, CoffeeQuery{ShopID: f.shopID, Filter: tt.filter, Limit: 20, OnlyPub: true})
			if err != nil {
				t.Fatal(err)
			}
			if total != len(tt.wantIDs) || len(got) != len(tt.wantIDs) {
				t.Fatalf("total=%d len=%d, want %d", total, len(got), len(tt.wantIDs))
			}
			for i, c := range got {
				if c.ID != tt.wantIDs[i] {
					t.Errorf("node %d = %s, want %s", i, c.ID, tt.wantIDs[i])
				}
				if c.Shop == nil || c.Shop.Slug != f.shopSlug || c.OriginCountry == nil || c.ProcessingMethod == nil {
					t.Errorf("joined fields missing on %s", c.ID)
				}
			}
		})
	}

	c, owner, err := s.CoffeeByID(ctx, f.draftID)
	if err != nil || owner != f.userID || c.IsPublished {
		t.Errorf("CoffeeByID(draft) = %v, %q, %v", c, owner, err)
	}
	if _, _, err := s.CoffeeByID(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, ErrNotFound) {
		t.Errorf("CoffeeByID(missing) err = %v, want ErrNotFound", err)
	}

	vs, err := s.VariantsByCoffee(ctx, f.pubID)
	if err != nil || len(vs) != 2 || vs[0].PriceTwd != 450 {
		t.Errorf("VariantsByCoffee = %+v, %v", vs, err)
	}
	cms, err := s.CommentsByCoffee(ctx, f.otherID)
	if err != nil || len(cms) != 1 || cms[0].User.DisplayName != "測試賣家" || cms[0].User.Email != "" {
		t.Errorf("CommentsByCoffee = %+v, %v (email must be hidden)", cms, err)
	}
	if n, err := s.CommentCount(ctx, f.otherID); err != nil || n != 1 {
		t.Errorf("CommentCount = %d, %v", n, err)
	}
}

func TestIntegrationShopsAndLookups(t *testing.T) {
	s, pool := testStore(t)
	f := seed(t, pool)
	ctx := context.Background()

	city := "ZZ-測試市"
	shops, total, err := s.ListShops(ctx, &city, 20, 0)
	if err != nil || total != 1 || len(shops) != 1 || shops[0].ID != f.shopID {
		t.Fatalf("ListShops(city) = %v, %d, %v", shops, total, err)
	}
	if sh, err := s.ShopBySlug(ctx, f.shopSlug); err != nil || sh.ID != f.shopID {
		t.Errorf("ShopBySlug = %v, %v", sh, err)
	}
	if _, err := s.ShopBySlug(ctx, "no-such-shop"); !errors.Is(err, ErrNotFound) {
		t.Errorf("ShopBySlug(missing) err = %v", err)
	}
	if sh, err := s.ShopByOwner(ctx, f.userID); err != nil || sh.ID != f.shopID {
		t.Errorf("ShopByOwner = %v, %v", sh, err)
	}
	pins, err := s.ShopPins(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range pins {
		found = found || p.ID == f.shopID
	}
	if !found {
		t.Error("ShopPins missing seeded shop")
	}
	if u, err := s.UserByID(ctx, f.userID); err != nil || u.Role != model.UserRoleSeller {
		t.Errorf("UserByID = %v, %v", u, err)
	}

	if v, err := s.OriginCountries(ctx); err != nil || len(v) != 24 {
		t.Errorf("OriginCountries len=%d err=%v, want 24", len(v), err)
	}
	if v, err := s.CoffeeVarieties(ctx); err != nil || len(v) != 23 {
		t.Errorf("CoffeeVarieties len=%d err=%v, want 23", len(v), err)
	}
	if v, err := s.ProcessingMethods(ctx); err != nil || len(v) != 12 {
		t.Errorf("ProcessingMethods len=%d err=%v, want 12", len(v), err)
	}
	if pop, err := s.PopularCoffees(ctx, 100); err != nil || len(pop) == 0 {
		t.Errorf("PopularCoffees = %d, %v", len(pop), err)
	}
}
