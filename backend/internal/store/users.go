package store

import (
	"context"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

// UserByID returns ErrNotFound when the user does not exist.
func (s *Store) UserByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	var role string
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email::text, display_name, role::text, created_at
		FROM users WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &role, &u.CreatedAt)
	if err != nil {
		return nil, notFound(err)
	}
	u.Role = model.UserRole(role)
	return &u, nil
}
