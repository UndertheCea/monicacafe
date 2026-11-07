package store

import "context"

// commentCols lists a comment's columns for the table or alias t, plus
// from_shop: whether the author owns the shop the coffee belongs to. It is
// computed from shops.owner_id on every read, so it follows ownership rather
// than being stored with the comment.
func commentCols(t string) string {
	return t + `.id, ` + t + `.user_id, ` + t + `.coffee_id, ` + t + `.body, ` + t + `.created_at, ` + t + `.edited_at,
		EXISTS (SELECT 1 FROM coffees fc JOIN shops fs ON fs.id = fc.shop_id
			WHERE fc.id = ` + t + `.coffee_id AND fs.owner_id = ` + t + `.user_id) AS from_shop`
}

// commentColumns is commentCols for the unaliased comments table.
var commentColumns = commentCols("comments")

func scanComment(row interface{ Scan(...any) error }) (*Comment, error) {
	var c Comment
	if err := row.Scan(&c.ID, &c.UserID, &c.CoffeeID, &c.Body, &c.CreatedAt, &c.EditedAt, &c.FromShop); err != nil {
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

// UpdateCommentBody replaces a comment's text and sets edited_at. Text equal
// to the current body changes nothing (edited_at stays as it was). Returns
// ErrNotFound if the comment does not exist.
func (s *Store) UpdateCommentBody(ctx context.Context, id, body string) (*Comment, error) {
	return scanComment(s.db.QueryRow(ctx, `
		WITH upd AS (
			UPDATE comments SET body = $2, edited_at = now()
			WHERE id = $1 AND body IS DISTINCT FROM $2
			RETURNING id, user_id, coffee_id, body, created_at, edited_at
		)
		SELECT `+commentCols("upd")+` FROM upd
		UNION ALL
		SELECT `+commentColumns+` FROM comments WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM upd)`, id, body))
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

// CommentsByCoffee lists a page of a coffee's comments, newest first (ties
// broken by id, so pages don't overlap).
func (s *Store) CommentsByCoffee(ctx context.Context, coffeeID string, limit, offset int) ([]*Comment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+commentColumns+` FROM comments
		WHERE coffee_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, coffeeID, limit, offset)
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

// CommentsByShop lists a page of the comments on every coffee of a shop
// (drafts included), newest first, plus the total.
func (s *Store) CommentsByShop(ctx context.Context, shopID string, limit, offset int) ([]*Comment, int, error) {
	return s.commentPage(ctx, `FROM comments cm JOIN coffees c ON c.id = cm.coffee_id WHERE c.shop_id = $1`, shopID, limit, offset)
}

// commentPage runs a newest-first, offset-paged comment listing over `from`
// (a FROM … WHERE clause aliasing comments as cm, with one parameter $1).
func (s *Store) commentPage(ctx context.Context, from string, arg any, limit, offset int) ([]*Comment, int, error) {
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) `+from, arg).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `SELECT `+commentCols("cm")+` `+from+`
		ORDER BY cm.created_at DESC, cm.id LIMIT $2 OFFSET $3`, arg, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*Comment{}
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, c)
	}
	return out, total, mapErr(rows.Err())
}

// CommentsByUser lists a page of a user's comments, newest first, plus the total.
func (s *Store) CommentsByUser(ctx context.Context, userID string, limit, offset int) ([]*Comment, int, error) {
	return s.commentPage(ctx, `FROM comments cm WHERE cm.user_id = $1`, userID, limit, offset)
}
