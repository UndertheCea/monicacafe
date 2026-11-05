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
//   - otherwise: ErrRefreshReuse for a revoked token (possible theft; the caller
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

// RevokeUserRefreshTokens revokes every active refresh token for a user (logout everywhere).
func (s *Store) RevokeUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return mapErr(err)
}
