package store

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

const shopCols = `s.id::text, s.slug, s.name, s.description, s.logo_url, s.banner_url,
	s.city, s.lat, s.lng, s.created_at`

func scanShop(r pgx.Row) (*model.Shop, error) {
	var sh model.Shop
	err := r.Scan(&sh.ID, &sh.Slug, &sh.Name, &sh.Description, &sh.LogoURL, &sh.BannerURL,
		&sh.City, &sh.Lat, &sh.Lng, &sh.CreatedAt)
	return &sh, err
}

// ListShops returns shops (optionally filtered by exact city) ordered by
// city then name, plus the total match count.
func (s *Store) ListShops(ctx context.Context, city *string, limit, offset int) ([]*model.Shop, int, error) {
	var cityArg any
	if city != nil && *city != "" {
		cityArg = *city
	}
	var total int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM shops s WHERE ($1::text IS NULL OR s.city = $1)`, cityArg,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+shopCols+` FROM shops s
		WHERE ($1::text IS NULL OR s.city = $1)
		ORDER BY s.city, s.name
		LIMIT $2 OFFSET $3`, cityArg, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	shops, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.Shop, error) { return scanShop(r) })
	return shops, total, err
}

// ShopBySlug returns ErrNotFound when no shop has the slug.
func (s *Store) ShopBySlug(ctx context.Context, slug string) (*model.Shop, error) {
	sh, err := scanShop(s.pool.QueryRow(ctx, `SELECT `+shopCols+` FROM shops s WHERE s.slug = $1`, slug))
	if err != nil {
		return nil, notFound(err)
	}
	return sh, nil
}

// ShopByOwner returns the shop owned by userID, or ErrNotFound.
func (s *Store) ShopByOwner(ctx context.Context, userID string) (*model.Shop, error) {
	sh, err := scanShop(s.pool.QueryRow(ctx,
		`SELECT `+shopCols+` FROM shops s WHERE s.owner_id = $1::uuid`, userID))
	if err != nil {
		return nil, notFound(err)
	}
	return sh, nil
}

// ShopPins returns every shop that has coordinates, for the map page.
func (s *Store) ShopPins(ctx context.Context) ([]*model.ShopPin, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, slug, name, city, lat, lng FROM shops
		WHERE lat IS NOT NULL AND lng IS NOT NULL
		ORDER BY name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.ShopPin, error) {
		var p model.ShopPin
		err := r.Scan(&p.ID, &p.Slug, &p.Name, &p.City, &p.Lat, &p.Lng)
		return &p, err
	})
}
