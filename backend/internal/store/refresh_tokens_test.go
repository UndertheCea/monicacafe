package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestPruneRefreshTokens removes expired rows (in batches) and keeps live and
// recently revoked ones, which reuse detection still needs.
func TestPruneRefreshTokens(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	now := time.Now()

	err := s.InTx(ctx, func(tx *store.Store) error {
		u, err := tx.CreateUser(ctx, "prune-"+suffix+"@example.test", "x", "p")
		if err != nil {
			return err
		}
		rows := []struct {
			hash    string
			expires time.Time
		}{
			{"expired-a-" + suffix, now.Add(-time.Hour)},
			{"expired-b-" + suffix, now.Add(-time.Minute)},
			{"expired-c-" + suffix, now.Add(-48 * time.Hour)},
			{"live-" + suffix, now.Add(time.Hour)},
			{"rotated-" + suffix, now.Add(time.Hour)},
		}
		for _, r := range rows {
			if err := tx.SaveRefreshToken(ctx, u.ID, r.hash, r.expires); err != nil {
				return err
			}
		}
		// A rotated (revoked) token that hasn't expired must be kept.
		if err := tx.RotateRefreshToken(ctx, "rotated-"+suffix, u.ID, "successor-"+suffix, now.Add(time.Hour), time.Second); err != nil {
			return err
		}

		// Batch of 2 forces more than one DELETE round.
		n, err := tx.PruneRefreshTokens(ctx, 2)
		if err != nil {
			return err
		}
		if n < 3 {
			t.Errorf("pruned %d rows, want at least the 3 expired ones", n)
		}
		var left int
		if err := tx.QueryRowForTest(ctx, `SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, u.ID).Scan(&left); err != nil {
			return err
		}
		if left != 3 { // live, rotated, successor
			t.Errorf("%d rows left for the user, want 3", left)
		}
		if _, err := tx.PruneRefreshTokens(ctx, 0); err == nil {
			t.Error("batch 0 should be rejected")
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
