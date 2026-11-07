package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/underthecea/monicacafe/backend/internal/auth"
)

const userColumns = `id, email, password_hash, display_name, role, created_at`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.Role, &u.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	return &u, nil
}

// CreateUser inserts a new BUYER account. Returns ErrConflict if the email is taken.
func (s *Store) CreateUser(ctx context.Context, email, passwordHash, displayName string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING `+userColumns, email, passwordHash, displayName))
}

// UserByID fetches a user by primary key.
func (s *Store) UserByID(ctx context.Context, id string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

// UserByEmail fetches a user by (case-insensitive) email.
func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
}

// UsersByIDs batch-fetches users, keyed by ID. Missing IDs are omitted.
func (s *Store) UsersByIDs(ctx context.Context, ids []string) (map[string]*User, error) {
	rows, err := s.db.Query(ctx, `SELECT `+userColumns+` FROM users WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]*User, len(ids))
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out[u.ID] = u
	}
	return out, mapErr(rows.Err())
}

// UpdateDisplayName sets a user's display name and returns the updated row.
func (s *Store) UpdateDisplayName(ctx context.Context, userID, displayName string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `
		UPDATE users SET display_name = $2 WHERE id = $1 RETURNING `+userColumns, userID, displayName))
}

// ChangePassword stores a new password hash and revokes every refresh token
// of the user in one transaction, so no session outlives the old password.
func (s *Store) ChangePassword(ctx context.Context, userID, passwordHash string) error {
	return s.InTx(ctx, func(tx *Store) error {
		tag, err := tx.db.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, userID, passwordHash)
		if err != nil {
			return mapErr(err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return tx.RevokeUserRefreshTokens(ctx, userID)
	})
}

// PromoteToSeller upgrades a BUYER to SELLER. ADMIN and SELLER roles are left unchanged.
func (s *Store) PromoteToSeller(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET role = 'SELLER' WHERE id = $1 AND role = 'BUYER'`, userID)
	return mapErr(err)
}

// ─── Refresh tokens ───────────────────────────────────────────────────────────

// SaveRefreshToken records an issued refresh token by the hash of its JTI.
func (s *Store) SaveRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, expiresAt)
	return mapErr(err)
}

// RotateRefreshToken consumes the refresh token with hash oldHash and records
// its successor (newHash) in one transaction, using auth.ClassifyRefresh to
// decide what the presented token allows:
//
//   - active: the old token is revoked and points at the new one;
//   - presented again within grace of its rotation while its successor is still
//     unused (a browser aborted the refresh response): the unused successor is
//     revoked and the new token replaces it;
//   - otherwise: ErrRefreshReuse for a rotated token (possible theft; the caller
//     revokes every session) or ErrNotFound for an unknown or expired one.
//
// userID (from the verified token claims) must match the row's owner, or
// ErrNotFound is returned.
func (s *Store) RotateRefreshToken(ctx context.Context, oldHash, userID, newHash string, newExpiresAt time.Time, grace time.Duration) error {
	return s.InTx(ctx, func(tx *Store) error {
		var (
			id, owner       string
			expiresAt, now  time.Time
			revokedAt       *time.Time
			replacedBy      *string
			successorActive bool
		)
		err := tx.db.QueryRow(ctx, `
			SELECT r.id, r.user_id, r.expires_at, r.revoked_at, r.replaced_by,
			       COALESCE(n.revoked_at IS NULL, false), now()
			FROM refresh_tokens r
			LEFT JOIN refresh_tokens n ON n.id = r.replaced_by
			WHERE r.token_hash = $1
			FOR UPDATE OF r`, oldHash).
			Scan(&id, &owner, &expiresAt, &revokedAt, &replacedBy, &successorActive, &now)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return mapErr(err)
		}
		if owner != userID {
			return ErrNotFound
		}
		state := auth.RefreshState{
			Found: true, ExpiresAt: expiresAt, RevokedAt: revokedAt,
			Rotated: replacedBy != nil, SuccessorActive: successorActive,
		}
		decision := auth.ClassifyRefresh(state, now, grace)
		if decision == auth.RefreshInvalid {
			return ErrNotFound
		}
		if decision == auth.RefreshReuse {
			return ErrRefreshReuse
		}

		var newID string
		if err := tx.db.QueryRow(ctx, `
			INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
			RETURNING id`, owner, newHash, newExpiresAt).Scan(&newID); err != nil {
			return mapErr(err)
		}
		if decision == auth.RefreshGraceReplay {
			// The successor never reached the browser: retire it and point it
			// (and the replayed token) at the new token, so a further replay
			// within the same window still finds an unused successor.
			if _, err := tx.db.Exec(ctx, `
				UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2
				WHERE id = $1 AND revoked_at IS NULL`, *replacedBy, newID); err != nil {
				return mapErr(err)
			}
			_, err := tx.db.Exec(ctx, `UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1`, id, newID)
			return mapErr(err)
		}
		_, err = tx.db.Exec(ctx, `
			UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, id, newID)
		return mapErr(err)
	})
}

// RevokeRefreshToken ends one session: the refresh token with hash tokenHash
// owned by userID and every token it was rotated into (a cookie can lag one
// rotation behind when the browser aborted a refresh) are revoked, and the
// revoked tokens are detached from the rotation chain. Without the detach, a
// late replay of an earlier token in the chain (inside the grace window, e.g.
// a request aborted just before logout) would find a rotated token whose
// successor is no longer active and be treated as theft, ending every other
// session; detached, it is just a revoked token and is refused. Returns how
// many tokens were revoked (0 for unknown, foreign or already-ended sessions).
func (s *Store) RevokeRefreshToken(ctx context.Context, tokenHash, userID string) (int, error) {
	var n int
	err := s.InTx(ctx, func(tx *Store) error {
		rows, err := tx.db.Query(ctx, `
			WITH RECURSIVE chain AS (
				SELECT id, replaced_by FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2
				UNION
				SELECT r.id, r.replaced_by FROM refresh_tokens r JOIN chain c ON r.id = c.replaced_by
			)
			UPDATE refresh_tokens SET revoked_at = now()
			WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
			RETURNING id`, tokenHash, userID)
		if err != nil {
			return mapErr(err)
		}
		ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return mapErr(err)
		}
		n = len(ids)
		if n == 0 {
			return nil
		}
		_, err = tx.db.Exec(ctx, `UPDATE refresh_tokens SET replaced_by = NULL WHERE replaced_by = ANY($1::uuid[])`, ids)
		return mapErr(err)
	})
	return n, err
}

// RevokeUserRefreshTokens revokes every active refresh token for a user (logout everywhere).
func (s *Store) RevokeUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return mapErr(err)
}

// PruneRefreshTokens deletes refresh tokens that expired before now, in
// batches of at most batch rows, and returns how many it removed. An expired
// token can never be accepted or trigger reuse detection (auth.ClassifyRefresh
// rejects it first), so its row is dead weight; every page load rotates a
// token, so without pruning the table grows with traffic.
func (s *Store) PruneRefreshTokens(ctx context.Context, batch int) (int64, error) {
	if batch <= 0 {
		return 0, errors.New("store: prune batch must be positive")
	}
	var total int64
	for {
		tag, err := s.db.Exec(ctx, `
			DELETE FROM refresh_tokens WHERE id IN (
				SELECT id FROM refresh_tokens WHERE expires_at < now() LIMIT $1)`, batch)
		if err != nil {
			return total, mapErr(err)
		}
		total += tag.RowsAffected()
		if tag.RowsAffected() < int64(batch) {
			return total, nil
		}
	}
}
