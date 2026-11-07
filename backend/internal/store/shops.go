package store

import (
	"context"
	"fmt"
	"strings"
)

const shopColumns = `id, owner_id, slug, name, description, logo_url, banner_url, city, lat, lng, created_at, updated_at`

func scanShop(row interface{ Scan(...any) error }) (*Shop, error) {
	var sh Shop
	if err := row.Scan(&sh.ID, &sh.OwnerID, &sh.Slug, &sh.Name, &sh.Description,
		&sh.LogoURL, &sh.BannerURL, &sh.City, &sh.Lat, &sh.Lng, &sh.CreatedAt, &sh.UpdatedAt); err != nil {
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

// ShopSort is a whitelisted shop-listing order ("" = newest first).
type ShopSort string

const (
	ShopSortNewest      ShopSort = ""
	ShopSortName        ShopSort = "NAME"
	ShopSortMostCoffees ShopSort = "MOST_COFFEES"
)

// Published coffees per shop, the same number Shop.coffeeCount shows.
const shopCoffeeCountJoin = ` LEFT JOIN LATERAL (SELECT count(*) AS n FROM coffees c
		WHERE c.shop_id = s.id AND c.is_published) cn ON true`

// orderBy returns the extra join a sort needs and its ORDER BY list. Every
// order ends on newest-then-id so offset paging is stable. Unknown values sort
// newest first.
func (o ShopSort) orderBy() (join, order string) {
	const tail = "s.created_at DESC, s.id"
	switch o {
	case ShopSortName:
		return "", "s.name, " + tail
	case ShopSortMostCoffees:
		return shopCoffeeCountJoin, "cn.n DESC, " + tail
	default:
		return "", tail
	}
}

// ShopFilter narrows a shop listing. Zero values are ignored.
type ShopFilter struct {
	City *string
	// SearchTerms: every term must appear (case-insensitive substring) in the
	// shop's name or description. Terms are matched literally. City is not
	// searched: filtering shops by city is an open owner decision (#50).
	SearchTerms []string
}

func (f ShopFilter) where() (string, []any) {
	var (
		conds []string
		args  []any
	)
	if f.City != nil {
		args = append(args, *f.City)
		conds = append(conds, fmt.Sprintf("s.city = $%d", len(args)))
	}
	for _, term := range f.SearchTerms {
		args = append(args, LikePattern(term))
		conds = append(conds, fmt.Sprintf("(s.name ILIKE $%[1]d OR s.description ILIKE $%[1]d)", len(args)))
	}
	if len(conds) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// ListShops returns a page of shops matching the filter in the given order,
// together with the total number of matching shops.
func (s *Store) ListShops(ctx context.Context, f ShopFilter, sort ShopSort, limit, offset int) ([]*Shop, int, error) {
	where, args := f.where()
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM shops s`+where, args...).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	join, order := sort.orderBy()
	n := len(args)
	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, fmt.Sprintf(`SELECT %s FROM shops s%s%s
		ORDER BY %s LIMIT $%d OFFSET $%d`, shopColumnsAs("s"), join, where, order, n+1, n+2), args...)
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

// shopColumnsAs qualifies shopColumns with a table alias.
func shopColumnsAs(alias string) string {
	cols := strings.Split(shopColumns, ", ")
	for i, c := range cols {
		cols[i] = alias + "." + c
	}
	return strings.Join(cols, ", ")
}

// PublishedCoffeeCountsByShopIDs batch-counts published coffees per shop.
// Shops with none are absent from the map (callers treat that as zero);
// drafts are never counted, so the number is safe to show publicly.
func (s *Store) PublishedCoffeeCountsByShopIDs(ctx context.Context, shopIDs []string) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT shop_id, count(*) FROM coffees
		WHERE shop_id = ANY($1::uuid[]) AND is_published
		GROUP BY shop_id`, shopIDs)
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
