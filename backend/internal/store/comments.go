package store

import "context"

const commentColumns = `id, user_id, coffee_id, body, created_at`

func scanComment(row interface{ Scan(...any) error }) (*Comment, error) {
	var c Comment
	if err := row.Scan(&c.ID, &c.UserID, &c.CoffeeID, &c.Body, &c.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	return &c, nil
}

// CreateComment inserts a comment.
func (s *Store) CreateComment(ctx context.Context, userID, coffeeID, body string) (*Comment, error) {
	return scanComment(s.db.QueryRow(ctx, `
		INSERT INTO comments (user_id, coffee_id, body) VALUES ($1, $2, $3)
		RETURNING `+commentColumns, userID, coffeeID, body))
}

// CommentByID fetches a single comment.
func (s *Store) CommentByID(ctx context.Context, id string) (*Comment, error) {
	return scanComment(s.db.QueryRow(ctx, `SELECT `+commentColumns+` FROM comments WHERE id = $1`, id))
}

// DeleteComment removes a comment. Returns ErrNotFound if it does not exist.
func (s *Store) DeleteComment(ctx context.Context, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM comments WHERE id = $1`, id)
	if err != nil {
		return mapErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CommentsByCoffee lists a coffee's comments, newest first.
func (s *Store) CommentsByCoffee(ctx context.Context, coffeeID string, limit int) ([]*Comment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+commentColumns+` FROM comments
		WHERE coffee_id = $1 ORDER BY created_at DESC, id LIMIT $2`, coffeeID, limit)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*Comment
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, mapErr(rows.Err())
}

// CommentCountsByCoffeeIDs batch-counts comments per coffee. Coffees with no
// comments are absent from the map (callers should treat that as zero).
func (s *Store) CommentCountsByCoffeeIDs(ctx context.Context, coffeeIDs []string) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT coffee_id, count(*) FROM comments
		WHERE coffee_id = ANY($1::uuid[]) GROUP BY coffee_id`, coffeeIDs)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]int, len(coffeeIDs))
	for rows.Next() {
		var (
			id string
			n  int
		)
		if err := rows.Scan(&id, &n); err != nil {
			return nil, mapErr(err)
		}
		out[id] = n
	}
	return out, mapErr(rows.Err())
}
