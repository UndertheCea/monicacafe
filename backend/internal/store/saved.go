package store

import "context"

// SaveCoffee bookmarks a coffee for a user. Saving it again changes nothing.
// Returns ErrInvalidReference if the user or coffee does not exist.
func (s *Store) SaveCoffee(ctx context.Context, userID, coffeeID string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO saved_coffees (user_id, coffee_id) VALUES ($1, $2)
		ON CONFLICT (user_id, coffee_id) DO NOTHING`, userID, coffeeID)
	return mapErr(err)
}

// UnsaveCoffee removes a bookmark; removing one that isn't there is not an error.
func (s *Store) UnsaveCoffee(ctx context.Context, userID, coffeeID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM saved_coffees WHERE user_id = $1 AND coffee_id = $2`, userID, coffeeID)
	return mapErr(err)
}

// SavedCoffeeIDs reports which of coffeeIDs the user has saved.
func (s *Store) SavedCoffeeIDs(ctx context.Context, userID string, coffeeIDs []string) (map[string]bool, error) {
	rows, err := s.db.Query(ctx, `
		SELECT coffee_id FROM saved_coffees
		WHERE user_id = $1 AND coffee_id = ANY($2::uuid[])`, userID, coffeeIDs)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]bool, len(coffeeIDs))
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, mapErr(err)
		}
		out[id] = true
	}
	return out, mapErr(rows.Err())
}

// SaveCountsByCoffeeIDs batch-counts saves per coffee. Coffees nobody saved
// are absent from the map (callers should treat that as zero).
func (s *Store) SaveCountsByCoffeeIDs(ctx context.Context, coffeeIDs []string) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT coffee_id, count(*) FROM saved_coffees
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

// SavedCoffeesByUser lists a page of the published coffees a user saved, most
// recently saved first, plus the total. Saved coffees that went back to draft
// are left out (and not counted) until they are published again.
func (s *Store) SavedCoffeesByUser(ctx context.Context, userID string, limit, offset int) ([]*Coffee, int, error) {
	const from = ` FROM saved_coffees sc JOIN coffees c ON c.id = sc.coffee_id
		WHERE sc.user_id = $1 AND ` + publicCoffee
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+from, userID).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `SELECT `+coffeeColumns+from+`
		ORDER BY sc.created_at DESC, sc.id LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	out, err := collectCoffees(rows)
	if out == nil {
		out = []*Coffee{}
	}
	return out, total, err
}
