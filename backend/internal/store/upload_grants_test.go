package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestReserveUpload: presigns count against a shop's rolling 24h budget; old
// ones age out, other shops are unaffected, and a budget of 0 is unlimited.
func TestReserveUpload(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	const mb = 1 << 20

	err := s.InTx(ctx, func(tx *store.Store) error {
		mk := func(tag string) string {
			u, err := tx.CreateUser(ctx, tag+"-"+suffix+"@example.test", "x", "p")
			if err != nil {
				t.Fatal(err)
			}
			sh, err := tx.CreateShop(ctx, store.CreateShopParams{OwnerID: u.ID, Slug: tag + "-" + suffix, Name: "s", City: "台北市"})
			if err != nil {
				t.Fatal(err)
			}
			return sh.ID
		}
		a, b := mk("quota-a"), mk("quota-b")

		steps := []struct {
			name    string
			shop    string
			bytes   int64
			budget  int64
			wantErr error
		}{
			{"first fits", a, 4 * mb, 10 * mb, nil},
			{"second fits exactly", a, 6 * mb, 10 * mb, nil},
			{"one more byte is refused", a, 1, 10 * mb, store.ErrUploadQuota},
			{"other shop unaffected", b, 10 * mb, 10 * mb, nil},
			{"unlimited budget", a, 100 * mb, 0, nil},
		}
		for _, st := range steps {
			if err := tx.ReserveUpload(ctx, st.shop, st.bytes, st.budget); !errors.Is(err, st.wantErr) {
				t.Errorf("%s: err %v, want %v", st.name, err, st.wantErr)
			}
		}

		// Grants older than the window stop counting and are deleted.
		if err := tx.QueryRowForTest(ctx, `UPDATE upload_grants SET created_at = now() - interval '25 hours' WHERE shop_id = $1 RETURNING 1`, a).Scan(new(int)); err != nil {
			t.Fatal(err)
		}
		if err := tx.ReserveUpload(ctx, a, 10*mb, 10*mb); err != nil {
			t.Errorf("after the window passed: %v", err)
		}
		var rows int
		if err := tx.QueryRowForTest(ctx, `SELECT count(*) FROM upload_grants WHERE shop_id = $1`, a).Scan(&rows); err != nil || rows != 1 {
			t.Errorf("rows for a = %d, %v; want 1 (old ones pruned)", rows, err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
