package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestSuspendBumpsTokenVersion (#454): suspending retires the access tokens
// (RevokeUserRefreshTokens bumps the version inside SetUserSuspended)
// already issued, so reinstating the account doesn't bring them back;
// reinstating leaves the version alone, and a no-op changes nothing.
func TestSuspendBumpsTokenVersion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	errRollback := errors.New("rollback")
	err := s.InTx(ctx, func(tx *store.Store) error {
		admin, err := tx.CreateUser(ctx, "suspender-"+suffix+"@example.test", "x", "admin")
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "suspended-"+suffix+"@example.test", "x", "u")
		if err != nil {
			return err
		}
		start, err := tx.UserTokenState(ctx, u.ID)
		if err != nil {
			return err
		}
		steps := []struct {
			name        string
			suspend     bool
			wantErr     error
			wantVersion int
			wantSusp    bool
		}{
			{"suspend bumps", true, nil, start.Version + 1, true},
			{"suspend again is a no-op", true, store.ErrNoChange, start.Version + 1, true},
			{"reinstate keeps the version", false, nil, start.Version + 1, false},
			{"suspend again bumps again", true, nil, start.Version + 2, true},
		}
		for _, st := range steps {
			err := tx.SetUserSuspended(ctx, admin.ID, u.ID, st.suspend, "test")
			if !errors.Is(err, st.wantErr) {
				return fmt.Errorf("%s: err = %v, want %v", st.name, err, st.wantErr)
			}
			got, err := tx.UserTokenState(ctx, u.ID)
			if err != nil {
				return err
			}
			if int(got.Version) != st.wantVersion || got.Suspended != st.wantSusp {
				return fmt.Errorf("%s: version %d suspended %v, want %d %v", st.name, got.Version, got.Suspended, st.wantVersion, st.wantSusp)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}

// TestSuspendRefusesAdmin (#485): the UPDATE itself refuses an ADMIN, so a
// grant landing after the resolver's role check can't leave a suspended admin.
// Reinstating an admin who was suspended before the grant still works.
func TestSuspendRefusesAdmin(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	errRollback := errors.New("rollback")
	err := s.InTx(ctx, func(tx *store.Store) error {
		actor, err := tx.CreateUser(ctx, "suspender-a-"+suffix+"@example.test", "x", "admin")
		if err != nil {
			return err
		}
		u, err := tx.CreateUser(ctx, "admin-target-"+suffix+"@example.test", "x", "u")
		if err != nil {
			return err
		}
		setRole := func(role string) error {
			_, err := tx.RawDB().Exec(ctx, `UPDATE users SET role = $2 WHERE id = $1`, u.ID, role)
			return err
		}
		steps := []struct {
			name    string
			role    string
			suspend bool
			want    error
			susp    bool
		}{
			{"admin can't be suspended", "ADMIN", true, store.ErrIsAdmin, false},
			{"buyer can", "BUYER", true, nil, true},
			{"admin granted while suspended can be reinstated", "ADMIN", false, nil, false},
			{"missing user is not found", "", true, store.ErrNotFound, false},
		}
		for _, st := range steps {
			id := u.ID
			if st.role == "" {
				id = "00000000-0000-0000-0000-000000000000"
			} else if err := setRole(st.role); err != nil {
				return err
			}
			if err := tx.SetUserSuspended(ctx, actor.ID, id, st.suspend, "test"); !errors.Is(err, st.want) {
				return fmt.Errorf("%s: err = %v, want %v", st.name, err, st.want)
			}
			if st.role == "" {
				continue
			}
			got, err := tx.UserTokenState(ctx, u.ID)
			if err != nil {
				return err
			}
			if got.Suspended != st.susp {
				return fmt.Errorf("%s: suspended = %v, want %v", st.name, got.Suspended, st.susp)
			}
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
