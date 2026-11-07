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

// TestRevokeRefreshToken: ending one session revokes the presented token and
// whatever it was rotated into, never another user's or another session's
// tokens, and leaves no rotation link pointing at a revoked token.
func TestRevokeRefreshToken(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	exp := time.Now().Add(time.Hour)

	cases := []struct {
		name    string
		setup   func(tx *store.Store, userID string) error // creates "tok-"+name (+ others)
		present string                                     // hash presented (default "tok-"+name)
		foreign bool                                       // present as another user
		want    int
		active  []string // hashes that must still be active afterwards
	}{
		{name: "active", want: 1, active: []string{"bystander"}},
		{name: "unknown", present: "nope", want: 0, active: []string{"tok-unknown", "bystander"}},
		{name: "foreign", foreign: true, want: 0, active: []string{"tok-foreign", "bystander"}},
		{name: "revoked", want: 0, setup: func(tx *store.Store, uid string) error {
			_, err := tx.RevokeRefreshToken(ctx, "tok-revoked-"+suffix, uid)
			return err
		}, active: []string{"bystander"}},
		{name: "rotated", want: 1, setup: func(tx *store.Store, uid string) error {
			return tx.RotateRefreshToken(ctx, "tok-rotated-"+suffix, uid, "next-rotated-"+suffix, exp, time.Minute)
		}, active: []string{"bystander"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := s.InTx(ctx, func(tx *store.Store) error {
				u, err := tx.CreateUser(ctx, "revoke-"+tc.name+"-"+suffix+"@example.test", "x", "r")
				if err != nil {
					return err
				}
				other, err := tx.CreateUser(ctx, "revoke-other-"+tc.name+"-"+suffix+"@example.test", "x", "o")
				if err != nil {
					return err
				}
				h := func(s string) string { return s + "-" + suffix }
				for _, hash := range []string{h("tok-" + tc.name), h("bystander-" + tc.name)} {
					if err := tx.SaveRefreshToken(ctx, u.ID, hash, exp); err != nil {
						return err
					}
				}
				if tc.setup != nil {
					if err := tc.setup(tx, u.ID); err != nil {
						return err
					}
				}
				present, uid := h("tok-"+tc.name), u.ID
				if tc.present != "" {
					present = h(tc.present)
				}
				if tc.foreign {
					uid = other.ID
				}
				n, err := tx.RevokeRefreshToken(ctx, present, uid)
				if err != nil {
					return err
				}
				if n != tc.want {
					t.Errorf("revoked %d, want %d", n, tc.want)
				}
				for _, a := range tc.active {
					hash := h(a)
					if a == "bystander" {
						hash = h("bystander-" + tc.name)
					}
					var revoked bool
					if err := tx.QueryRowForTest(ctx, `SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE token_hash = $1`, hash).Scan(&revoked); err != nil {
						return err
					}
					if revoked {
						t.Errorf("%s was revoked", a)
					}
				}
				// Only the listed tokens are active, and no link survives.
				var active, dangling int
				if err := tx.QueryRowForTest(ctx, `
					SELECT count(*) FILTER (WHERE revoked_at IS NULL),
					       count(*) FILTER (WHERE replaced_by IS NOT NULL)
					FROM refresh_tokens WHERE user_id = $1`, u.ID).Scan(&active, &dangling); err != nil {
					return err
				}
				if active != len(tc.active) {
					t.Errorf("%d active tokens, want %d", active, len(tc.active))
				}
				if dangling != 0 {
					t.Errorf("%d tokens still point at a revoked successor", dangling)
				}
				return errRollback
			})
			if !errors.Is(err, errRollback) {
				t.Fatal(err)
			}
		})
	}
}
