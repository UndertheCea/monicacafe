package store

import "context"

// FollowShop records that a user follows a shop. Following it again changes
// nothing. Returns ErrInvalidReference if the user or shop does not exist.
func (s *Store) FollowShop(ctx context.Context, userID, shopID string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO shop_follows (user_id, shop_id) VALUES ($1, $2)
		ON CONFLICT (user_id, shop_id) DO NOTHING`, userID, shopID)
	return mapErr(err)
}

// UnfollowShop removes a follow; removing one that isn't there is not an error.
func (s *Store) UnfollowShop(ctx context.Context, userID, shopID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM shop_follows WHERE user_id = $1 AND shop_id = $2`, userID, shopID)
	return mapErr(err)
}

// FollowedShopIDs reports which of shopIDs the user follows.
func (s *Store) FollowedShopIDs(ctx context.Context, userID string, shopIDs []string) (map[string]bool, error) {
	rows, err := s.db.Query(ctx, `
		SELECT shop_id FROM shop_follows
		WHERE user_id = $1 AND shop_id = ANY($2::uuid[])`, userID, shopIDs)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]bool, len(shopIDs))
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, mapErr(err)
		}
		out[id] = true
	}
	return out, mapErr(rows.Err())
}

// FollowerCountsByShopIDs batch-counts followers per shop. Shops nobody
// follows are absent from the map (callers should treat that as zero).
func (s *Store) FollowerCountsByShopIDs(ctx context.Context, shopIDs []string) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT shop_id, count(*) FROM shop_follows
		WHERE shop_id = ANY($1::uuid[]) GROUP BY shop_id`, shopIDs)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]int, len(shopIDs))
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

// FollowedShopsByUser lists a page of the shops a user follows, most recently
// followed first, plus the total.
func (s *Store) FollowedShopsByUser(ctx context.Context, userID string, limit, offset int) ([]*Shop, int, error) {
	const from = ` FROM shop_follows f JOIN shops s ON s.id = f.shop_id WHERE f.user_id = $1`
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+from, userID).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `SELECT `+shopColumnsAs("s")+from+`
		ORDER BY f.created_at DESC, f.id LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	out := []*Shop{}
	for rows.Next() {
		sh, err := scanShop(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, sh)
	}
	return out, total, mapErr(rows.Err())
}

// FollowingCoffees lists a page of published coffees from the shops a user
// follows, newest first (the same order as SortNewest), plus the total. Drafts
// are never included, not even the user's own.
func (s *Store) FollowingCoffees(ctx context.Context, userID string, limit, offset int) ([]*Coffee, int, error) {
	const from = ` FROM coffees c JOIN shop_follows f ON f.shop_id = c.shop_id
		WHERE f.user_id = $1 AND c.is_published`
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+from, userID).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `SELECT `+coffeeColumns+from+`
		ORDER BY c.created_at DESC, c.id LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	out, err := collectCoffees(rows)
	if out == nil {
		out = []*Coffee{}
	}
	return out, total, err
}
