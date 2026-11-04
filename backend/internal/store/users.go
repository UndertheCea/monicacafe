package store

import (
	"context"
	"time"
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

// ConsumeRefreshToken atomically revokes an active refresh token and returns its
// owner. Returns ErrNotFound if the token is unknown, expired or already used.
func (s *Store) ConsumeRefreshToken(ctx context.Context, tokenHash string) (string, error) {
	var userID string
	err := s.db.QueryRow(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
		RETURNING user_id`, tokenHash).Scan(&userID)
	return userID, mapErr(err)
}

// RevokeUserRefreshTokens revokes every active refresh token for a user (logout everywhere).
func (s *Store) RevokeUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return mapErr(err)
}
