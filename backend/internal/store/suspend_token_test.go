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
