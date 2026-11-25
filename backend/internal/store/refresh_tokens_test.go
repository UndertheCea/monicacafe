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

// TestRevokeAllThenStaleReplay (#397): after every session is revoked on
// purpose (password change, sign out everywhere), replaying an older token of
// a rotation chain is refused as revoked, not treated as theft, so the
// session issued afterwards survives.
func TestRevokeAllThenStaleReplay(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	exp := time.Now().Add(time.Hour)

	cases := []struct {
		name  string
		chain []string // rotations before the revoke: tok → chain[0] → chain[1] …
	}{
		{name: "one rotation", chain: []string{"b"}},
		{name: "two rotations", chain: []string{"b", "c"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := func(s string) string { return s + "-" + tc.name + "-" + suffix }
			err := s.InTx(ctx, func(tx *store.Store) error {
				u, err := tx.CreateUser(ctx, h("stale")+"@example.test", "x", "s")
				if err != nil {
					return err
				}
				if err := tx.SaveRefreshToken(ctx, u.ID, h("a"), exp); err != nil {
					return err
				}
				prev := h("a")
				for _, next := range tc.chain {
					if err := tx.RotateRefreshToken(ctx, prev, u.ID, h(next), exp, 0); err != nil {
						return err
					}
					prev = h(next)
				}
				if err := tx.RevokeUserRefreshTokens(ctx, u.ID); err != nil {
					return err
				}
				// The session issued after the revocation (e.g. by changePassword).
				if err := tx.SaveRefreshToken(ctx, u.ID, h("fresh"), exp); err != nil {
					return err
				}
				for _, stale := range append([]string{"a"}, tc.chain...) {
					err := tx.RotateRefreshToken(ctx, h(stale), u.ID, h("replay-"+stale), exp, 0)
					if errors.Is(err, store.ErrRefreshReuse) {
						t.Errorf("replaying %s after revoke-all was treated as theft", stale)
					} else if err == nil {
						t.Errorf("replaying %s after revoke-all was accepted", stale)
					}
				}
				var revoked bool
				if err := tx.QueryRowForTest(ctx, `SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE token_hash = $1`, h("fresh")).Scan(&revoked); err != nil {
					return err
				}
				if revoked {
					t.Error("the session issued after revoke-all was revoked")
				}
				return errRollback
			})
			if !errors.Is(err, errRollback) {
				t.Fatal(err)
			}
		})
	}
}

// TestRevokeAllWaitsForRotation (#525): a rotation in flight when "sign out
// everywhere" runs can't leave its new token active. Before the fix the revoke
// waited on the old token's row lock, then re-checked only the rows of its
// snapshot, so the successor inserted by the rotation stayed usable.
func TestRevokeAllWaitsForRotation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	exp := time.Now().Add(time.Hour)

	u, err := s.CreateUser(ctx, "race-"+suffix+"@example.test", "x", "race")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SaveRefreshToken(ctx, u.ID, "race-old-"+suffix, exp); err != nil {
		t.Fatal(err)
	}

	rotated := make(chan struct{})
	release := make(chan struct{})
	rotateDone := make(chan error, 1)
	go func() {
		rotateDone <- s.InTx(ctx, func(tx *store.Store) error {
			if err := tx.RotateRefreshToken(ctx, "race-old-"+suffix, u.ID, "race-new-"+suffix, exp, time.Second); err != nil {
				close(rotated)
				return err
			}
			close(rotated)
			<-release // hold the rotation open while the revoke starts
			return nil
		})
	}()
	<-rotated

	revokeDone := make(chan error, 1)
	go func() { revokeDone <- s.RevokeUserRefreshTokens(ctx, u.ID) }()
	select {
	case err := <-revokeDone:
		t.Fatalf("revoke finished while the rotation was still open (err %v)", err)
	case <-time.After(300 * time.Millisecond):
	}
	close(release)
	if err := <-rotateDone; err != nil {
		t.Fatal(err)
	}
	if err := <-revokeDone; err != nil {
		t.Fatal(err)
	}

	var active int
	if err := s.QueryRowForTest(ctx, `SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, u.ID).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 0 {
		t.Errorf("%d refresh tokens still active after revoking every session, want 0", active)
	}
}

// TestStartSession (#525): a session starts only for the token version the
// caller read; one read before a revoke-all is refused and saves nothing.
func TestStartSession(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	exp := time.Now().Add(time.Hour)

	err := s.InTx(ctx, func(tx *store.Store) error {
		u, err := tx.CreateUser(ctx, "session-"+suffix+"@example.test", "x", "s")
		if err != nil {
			return err
		}
		v := u.TokenVersion
		if err := tx.RevokeUserRefreshTokens(ctx, u.ID); err != nil {
			return err
		}
		cases := []struct {
			name    string
			userID  string
			version int
			hash    string
			wantErr error
		}{
			{"version read before the revoke", u.ID, v, "stale-" + suffix, store.ErrStaleSession},
			{"current version", u.ID, v + 1, "fresh-" + suffix, nil},
			{"unknown user", "00000000-0000-0000-0000-000000000000", 0, "ghost-" + suffix, store.ErrNotFound},
		}
		for _, c := range cases {
			if err := tx.StartSession(ctx, c.userID, c.version, c.hash, exp); !errors.Is(err, c.wantErr) {
				return fmt.Errorf("%s: err = %v, want %v", c.name, err, c.wantErr)
			}
			var n int
			if err := tx.QueryRowForTest(ctx, `SELECT count(*) FROM refresh_tokens WHERE token_hash = $1`, c.hash).Scan(&n); err != nil {
				return err
			}
			if want := map[bool]int{true: 1, false: 0}[c.wantErr == nil]; n != want {
				return fmt.Errorf("%s: %d rows saved, want %d", c.name, n, want)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
