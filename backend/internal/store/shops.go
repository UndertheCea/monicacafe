package store

import (
	"context"
)

const shopColumns = `id, owner_id, slug, name, description, logo_url, banner_url, city, lat, lng, created_at`

func scanShop(row interface{ Scan(...any) error }) (*Shop, error) {
	var sh Shop
	if err := row.Scan(&sh.ID, &sh.OwnerID, &sh.Slug, &sh.Name, &sh.Description,
		&sh.LogoURL, &sh.BannerURL, &sh.City, &sh.Lat, &sh.Lng, &sh.CreatedAt); err != nil {
		return nil, mapErr(err)
	}
	return &sh, nil
}

// CreateShopParams holds the fields required to open a shop.
type CreateShopParams struct {
	OwnerID     string
	Slug        string
	Name        string
	Description string
	City        string
}

// CreateShop inserts a shop. Returns ErrConflict if the slug is taken or the
// owner already has a shop (see ViolatedConstraint to tell them apart).
func (s *Store) CreateShop(ctx context.Context, p CreateShopParams) (*Shop, error) {
	return scanShop(s.db.QueryRow(ctx, `
		INSERT INTO shops (owner_id, slug, name, description, city)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+shopColumns, p.OwnerID, p.Slug, p.Name, p.Description, p.City))
}

// UpdateShopParams holds optional shop fields; nil means "leave unchanged".
type UpdateShopParams struct {
	Name        *string
	Description *string
	LogoURL     *string // "" clears
	BannerURL   *string // "" clears
	City        *string
	Lat         *float64
	Lng         *float64
}

// UpdateShop applies a partial update.
func (s *Store) UpdateShop(ctx context.Context, id string, p UpdateShopParams) (*Shop, error) {
	return scanShop(s.db.QueryRow(ctx, `
		UPDATE shops SET
			name        = COALESCE($2, name),
			description = COALESCE($3, description),
			logo_url    = CASE WHEN $4::text IS NULL THEN logo_url ELSE NULLIF($4, '') END,
			banner_url  = CASE WHEN $5::text IS NULL THEN banner_url ELSE NULLIF($5, '') END,
			city        = COALESCE($6, city),
			lat         = COALESCE($7, lat),
			lng         = COALESCE($8, lng)
		WHERE id = $1
		RETURNING `+shopColumns,
		id, p.Name, p.Description, p.LogoURL, p.BannerURL, p.City, p.Lat, p.Lng))
}

// ShopByID fetches a shop by primary key.
func (s *Store) ShopByID(ctx context.Context, id string) (*Shop, error) {
	return scanShop(s.db.QueryRow(ctx, `SELECT `+shopColumns+` FROM shops WHERE id = $1`, id))
}

// ShopBySlug fetches a shop by its public slug.
func (s *Store) ShopBySlug(ctx context.Context, slug string) (*Shop, error) {
	return scanShop(s.db.QueryRow(ctx, `SELECT `+shopColumns+` FROM shops WHERE slug = $1`, slug))
}

// ShopByOwner fetches the shop owned by a user.
func (s *Store) ShopByOwner(ctx context.Context, ownerID string) (*Shop, error) {
	return scanShop(s.db.QueryRow(ctx, `SELECT `+shopColumns+` FROM shops WHERE owner_id = $1`, ownerID))
}

// ShopsByIDs batch-fetches shops keyed by ID.
func (s *Store) ShopsByIDs(ctx context.Context, ids []string) (map[string]*Shop, error) {
	rows, err := s.db.Query(ctx, `SELECT `+shopColumns+` FROM shops WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string]*Shop, len(ids))
	for rows.Next() {
		sh, err := scanShop(rows)
		if err != nil {
			return nil, err
		}
		out[sh.ID] = sh
	}
	return out, mapErr(rows.Err())
}

// ListShops returns a page of shops (newest first), optionally filtered by city,
// together with the total number of matching shops.
func (s *Store) ListShops(ctx context.Context, city *string, limit, offset int) ([]*Shop, int, error) {
	var total int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM shops WHERE ($1::text IS NULL OR city = $1)`, city).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := s.db.Query(ctx, `
		SELECT `+shopColumns+` FROM shops
		WHERE ($1::text IS NULL OR city = $1)
		ORDER BY created_at DESC, id
		LIMIT $2 OFFSET $3`, city, limit, offset)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	defer rows.Close()
	var out []*Shop
	for rows.Next() {
		sh, err := scanShop(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, sh)
	}
	return out, total, mapErr(rows.Err())
}

// ShopPin is the lightweight projection of a shop used by the map page.
type ShopPin struct {
	ID   string
	Slug string
	Name string
	City string
	Lat  *float64
	Lng  *float64
}

// ShopPins returns every shop's map pin, grouped by city then name. Only the
// six columns the map needs are read (no descriptions / image URLs).
func (s *Store) ShopPins(ctx context.Context) ([]*ShopPin, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, slug, name, city, lat, lng FROM shops ORDER BY city, name, id`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*ShopPin
	for rows.Next() {
		p := &ShopPin{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Name, &p.City, &p.Lat, &p.Lng); err != nil {
			return nil, mapErr(err)
		}
		out = append(out, p)
	}
	return out, mapErr(rows.Err())
}

// ImageURLs returns every image URL a row still points at: shop logos and
// banners and coffee galleries (drafts included). Used to find orphaned
// objects in the media bucket.
func (s *Store) ImageURLs(ctx context.Context) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT logo_url FROM shops WHERE logo_url IS NOT NULL AND logo_url <> ''
		UNION SELECT banner_url FROM shops WHERE banner_url IS NOT NULL AND banner_url <> ''
		UNION SELECT unnest(image_urls) FROM coffees`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, mapErr(err)
		}
		out = append(out, u)
	}
	return out, mapErr(rows.Err())
}
