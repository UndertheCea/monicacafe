package store

import (
	"context"
	"fmt"
	"strings"
)

const coffeeColumns = `c.id, c.shop_id, c.name, c.slug, c.description, c.origin_country_id, c.variety_id,
	c.processing_method_id, c.roast_level, c.flavor_notes, c.image_urls, c.is_published, c.created_at, c.updated_at,
	c.producer, c.region, c.altitude_min_m, c.altitude_max_m, c.brew_method, c.harvest_year`

func scanCoffee(row interface{ Scan(...any) error }) (*Coffee, error) {
	var c Coffee
	if err := row.Scan(&c.ID, &c.ShopID, &c.Name, &c.Slug, &c.Description, &c.OriginCountryID,
		&c.VarietyID, &c.ProcessingMethodID, &c.RoastLevel, &c.FlavorNotes, &c.ImageURLs,
		&c.IsPublished, &c.CreatedAt, &c.UpdatedAt,
		&c.Producer, &c.Region, &c.AltitudeMinM, &c.AltitudeMaxM, &c.BrewMethod, &c.HarvestYear); err != nil {
		return nil, mapErr(err)
	}
	if c.FlavorNotes == nil {
		c.FlavorNotes = []string{}
	}
	if c.ImageURLs == nil {
		c.ImageURLs = []string{}
	}
	return &c, nil
}

func collectCoffees(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}) ([]*Coffee, error) {
	defer rows.Close()
	var out []*Coffee
	for rows.Next() {
		c, err := scanCoffee(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, mapErr(rows.Err())
}

// CoffeeByID fetches a coffee regardless of publication state.
func (s *Store) CoffeeByID(ctx context.Context, id string) (*Coffee, error) {
	return scanCoffee(s.db.QueryRow(ctx, `SELECT `+coffeeColumns+` FROM coffees c WHERE c.id = $1`, id))
}

// CoffeesByIDs batch-loads coffees (drafts included; callers check
// visibility). Missing IDs are absent from the map.
func (s *Store) CoffeesByIDs(ctx context.Context, ids []string) (map[string]*Coffee, error) {
	rows, err := s.db.Query(ctx, `SELECT `+coffeeColumns+` FROM coffees c WHERE c.id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, mapErr(err)
	}
	cs, err := collectCoffees(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[string]*Coffee, len(cs))
	for _, c := range cs {
		out[c.ID] = c
	}
	return out, nil
}

// CoffeeFilter narrows a coffee listing. Nil fields are ignored.
type CoffeeFilter struct {
	ShopID             *string
	OriginCountryID    *string
	VarietyID          *string
	ProcessingMethodID *string
	RoastLevel         *string
	FlavorNote         *string
	// SearchTerms: every term must appear (case-insensitive substring) in the
	// coffee's name, description, a flavor note, its producer, region or
	// harvest year, its shop's name, or its origin / variety / process names. Terms are matched
	// literally.
	SearchTerms []string
	MinPriceTWD *int64
	MaxPriceTWD *int64
	// InStock keeps only coffees with an available variant that has stock;
	// SoldOut keeps only those without one (the shop page's archive, #163).
	// Setting both matches nothing.
	InStock bool
	SoldOut bool
	// BrewMethods keeps coffees whose brew_method is any of these (nil = all).
	BrewMethods []string
	// MinHarvestYear keeps coffees harvested in this year or later; a coffee
	// without a harvest year never matches.
	MinHarvestYear *int
	// MinAltitudeM keeps coffees whose top growing altitude (the max, or the
	// single height) is at least this; a coffee without one never matches.
	MinAltitudeM *int
	// IncludeUnpublished also returns drafts; only set for the owning seller.
	IncludeUnpublished bool
}

func (f CoffeeFilter) where() (string, []any) {
	var (
		conds []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if !f.IncludeUnpublished {
		conds = append(conds, "c.is_published")
	}
	if f.ShopID != nil {
		add("c.shop_id = $%d", *f.ShopID)
	}
	if f.OriginCountryID != nil {
		add("c.origin_country_id = $%d", *f.OriginCountryID)
	}
	if f.VarietyID != nil {
		add("c.variety_id = $%d", *f.VarietyID)
	}
	if f.ProcessingMethodID != nil {
		add("c.processing_method_id = $%d", *f.ProcessingMethodID)
	}
	if f.RoastLevel != nil {
		add("c.roast_level = $%d::roast_level", *f.RoastLevel)
	}
	if f.FlavorNote != nil {
		// Case-insensitive exact match on any flavor note.
		add("EXISTS (SELECT 1 FROM unnest(c.flavor_notes) n WHERE lower(n) = lower($%d))", *f.FlavorNote)
	}
	for _, term := range f.SearchTerms {
		add(searchCond, LikePattern(term))
	}
	if f.MinPriceTWD != nil || f.MaxPriceTWD != nil {
		// A coffee matches when at least one in-stock, available variant is within range.
		var priceConds []string
		if f.MinPriceTWD != nil {
			args = append(args, *f.MinPriceTWD)
			priceConds = append(priceConds, fmt.Sprintf("v.price_twd >= $%d", len(args)))
		}
		if f.MaxPriceTWD != nil {
			args = append(args, *f.MaxPriceTWD)
			priceConds = append(priceConds, fmt.Sprintf("v.price_twd <= $%d", len(args)))
		}
		conds = append(conds, "EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0 AND "+
			strings.Join(priceConds, " AND ")+")")
	}
	if len(f.BrewMethods) > 0 {
		add("c.brew_method = ANY($%d)", f.BrewMethods)
	}
	if f.MinHarvestYear != nil {
		add("c.harvest_year >= $%d", *f.MinHarvestYear)
	}
	if f.MinAltitudeM != nil {
		add("COALESCE(c.altitude_max_m, c.altitude_min_m) >= $%d", *f.MinAltitudeM)
	}
	if f.InStock {
		conds = append(conds, buyableCond)
	}
	if f.SoldOut {
		conds = append(conds, "NOT "+buyableCond)
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// buyableCond: the coffee has at least one available, in-stock variant.
const buyableCond = "EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0)"

// searchCond matches one search term (a LIKE pattern, $N) against every text
// a buyer might type: names in both languages, notes, provenance, the shop.
const searchCond = `(c.name ILIKE $%[1]d OR c.description ILIKE $%[1]d
		OR c.producer ILIKE $%[1]d OR c.region ILIKE $%[1]d OR c.harvest_year::text ILIKE $%[1]d
		OR EXISTS (SELECT 1 FROM unnest(c.flavor_notes) n WHERE n ILIKE $%[1]d)
		OR EXISTS (SELECT 1 FROM shops s WHERE s.id = c.shop_id AND s.name ILIKE $%[1]d)
		OR EXISTS (SELECT 1 FROM origin_countries o WHERE o.id = c.origin_country_id AND (o.name_en ILIKE $%[1]d OR o.name_zh ILIKE $%[1]d))
		OR EXISTS (SELECT 1 FROM coffee_varieties cv WHERE cv.id = c.variety_id AND cv.name ILIKE $%[1]d)
		OR EXISTS (SELECT 1 FROM processing_methods pm WHERE pm.id = c.processing_method_id AND (pm.name_en ILIKE $%[1]d OR pm.name_zh ILIKE $%[1]d)))`

// LikePattern turns a search term into a LIKE pattern that matches it as a
// literal substring: the wildcards % and _ and the escape character \ are
// escaped (Postgres' default LIKE escape is a backslash).
func LikePattern(term string) string {
	return "%" + likeEscaper.Replace(term) + "%"
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// CoffeeSort orders a coffee listing. The zero value is SortNewest.
type CoffeeSort string

const (
	SortNewest        CoffeeSort = ""
	SortPriceAsc      CoffeeSort = "PRICE_ASC"
	SortPriceDesc     CoffeeSort = "PRICE_DESC"
	SortMostDiscussed CoffeeSort = "MOST_DISCUSSED"
	SortMostSaved     CoffeeSort = "MOST_SAVED"
	// SortShopOrder is the seller's lineup (coffees.shop_position, #161);
	// only meaningful within one shop.
	SortShopOrder CoffeeSort = "SHOP_ORDER"
)

// Lowest price among a coffee's available, in-stock variants (what the card
// shows as "from NT$…"); NULL when it's sold out.
const fromPriceJoin = ` LEFT JOIN LATERAL (SELECT min(v.price_twd) AS p FROM variants v
		WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0) fp ON true`

const commentCountJoin = ` LEFT JOIN LATERAL (SELECT count(*) AS n FROM comments cm WHERE cm.coffee_id = c.id) cc ON true`

const saveCountJoin = ` LEFT JOIN LATERAL (SELECT count(*) AS n FROM saved_coffees sv WHERE sv.coffee_id = c.id) sc ON true`

// orderBy returns the extra join a sort needs and its ORDER BY list. Every
// order ends on newest-then-id so offset paging is stable; sold-out coffees
// go last in both price directions. Unknown values sort newest first.
func (s CoffeeSort) orderBy() (join, order string) {
	const tail = "c.created_at DESC, c.id"
	switch s {
	case SortPriceAsc:
		return fromPriceJoin, "fp.p ASC NULLS LAST, " + tail
	case SortPriceDesc:
		return fromPriceJoin, "fp.p DESC NULLS LAST, " + tail
	case SortMostDiscussed:
		return commentCountJoin, "cc.n DESC, " + tail
	case SortMostSaved:
		return saveCountJoin, "sc.n DESC, " + tail
	case SortShopOrder:
		return "", "c.shop_position, " + tail
	default:
		return "", tail
	}
}

// ListCoffees returns a page of coffees matching the filter in the given
// order, plus the total number of matches.
func (s *Store) ListCoffees(ctx context.Context, f CoffeeFilter, sort CoffeeSort, limit, offset int) ([]*Coffee, int, error) {
	where, args := f.where()
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM coffees c`+where, args...).Scan(&total); err != nil {
		return nil, 0, mapErr(err)
	}
	join, order := sort.orderBy()
	n := len(args)
	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, fmt.Sprintf(`SELECT %s FROM coffees c%s%s
		ORDER BY %s LIMIT $%d OFFSET $%d`, coffeeColumns, join, where, order, n+1, n+2), args...)
	if err != nil {
		return nil, 0, mapErr(err)
	}
	out, err := collectCoffees(rows)
	return out, total, err
}

// PopularCoffees returns published coffees ranked by comment count, then recency.
func (s *Store) PopularCoffees(ctx context.Context, limit int) ([]*Coffee, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+coffeeColumns+` FROM coffees c
		LEFT JOIN (SELECT coffee_id, count(*) AS n FROM comments GROUP BY coffee_id) cc ON cc.coffee_id = c.id
		WHERE c.is_published
		ORDER BY COALESCE(cc.n, 0) DESC, c.created_at DESC, c.id
		LIMIT $1`, limit)
	if err != nil {
		return nil, mapErr(err)
	}
	return collectCoffees(rows)
}

// Similarity weights for SimilarCoffees. A shared roast alone (one of four
// levels) is too common to count as similar, hence the minimum score. The
// same brew method only reorders coffees that already qualify: most coffees
// are filter roasts, so it can't make a coffee similar on its own.
const (
	similarOrigin   = 3
	similarProcess  = 2
	similarRoast    = 1
	similarMaxNotes = 3 // each shared flavour note scores 1, up to this many
	similarMinScore = 2
	similarBrew     = 1
)

// SimilarCoffees returns published coffees from other shops that resemble
// coffeeID: origin (3) + process (2) + roast (1) + shared flavour notes
// (case-insensitive, 1 each, at most 3). Coffees scoring below 2 are left
// out. In-stock coffees come first, then by score plus 1 for the same brew
// method, then newest.
func (s *Store) SimilarCoffees(ctx context.Context, coffeeID string, limit int) ([]*Coffee, error) {
	rows, err := s.db.Query(ctx, `
		WITH src AS (
			SELECT shop_id, origin_country_id, processing_method_id, roast_level, brew_method,
				ARRAY(SELECT DISTINCT lower(n) FROM unnest(flavor_notes) n) AS notes
			FROM coffees WHERE id = $1
		)
		SELECT `+coffeeColumns+`
		FROM coffees c
		CROSS JOIN src
		CROSS JOIN LATERAL (SELECT
			CASE WHEN c.origin_country_id = src.origin_country_id THEN $3::int ELSE 0 END
			+ CASE WHEN c.processing_method_id = src.processing_method_id THEN $4::int ELSE 0 END
			+ CASE WHEN c.roast_level = src.roast_level THEN $5::int ELSE 0 END
			+ LEAST($6::int, (SELECT count(DISTINCT lower(n)) FROM unnest(c.flavor_notes) n
				WHERE lower(n) = ANY(src.notes)))::int AS score) sc
		CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM variants v
			WHERE v.coffee_id = c.id AND v.is_available AND v.stock > 0) AS ok) st
		WHERE c.is_published AND c.shop_id <> src.shop_id AND sc.score >= $7
		ORDER BY st.ok DESC,
			sc.score + CASE WHEN c.brew_method = src.brew_method THEN $8::int ELSE 0 END DESC,
			c.created_at DESC, c.id
		LIMIT $2`, coffeeID, limit, similarOrigin, similarProcess, similarRoast, similarMaxNotes, similarMinScore,
		similarBrew)
	if err != nil {
		return nil, mapErr(err)
	}
	return collectCoffees(rows)
}

// CreateCoffeeParams holds the fields for a new (unpublished) coffee listing.
type CreateCoffeeParams struct {
	ShopID             string
	Name               string
	Slug               string
	Description        string
	OriginCountryID    string
	VarietyID          *string
	ProcessingMethodID string
	RoastLevel         *string // nil = not given
	FlavorNotes        []string
	Producer           string
	Region             string
	AltitudeMinM       *int
	AltitudeMaxM       *int
	BrewMethod         *string
	HarvestYear        *int
}

// CreateCoffee inserts a draft coffee.
// CountShopCoffees counts a shop's coffees, drafts included.
func (s *Store) CountShopCoffees(ctx context.Context, shopID string) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM coffees WHERE shop_id = $1`, shopID).Scan(&n)
	return n, mapErr(err)
}

func (s *Store) CreateCoffee(ctx context.Context, p CreateCoffeeParams) (*Coffee, error) {
	if p.FlavorNotes == nil {
		p.FlavorNotes = []string{}
	}
	return scanCoffee(s.db.QueryRow(ctx, `
		WITH c AS (
			INSERT INTO coffees (shop_id, name, slug, description, origin_country_id, variety_id,
				processing_method_id, roast_level, flavor_notes, producer, region, altitude_min_m, altitude_max_m,
				brew_method, harvest_year)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::roast_level, $9, $10, $11, $12, $13, $14, $15)
			RETURNING *
		)
		SELECT `+coffeeColumns+` FROM c`,
		p.ShopID, p.Name, p.Slug, p.Description, p.OriginCountryID, p.VarietyID,
		p.ProcessingMethodID, p.RoastLevel, p.FlavorNotes, p.Producer, p.Region, p.AltitudeMinM, p.AltitudeMaxM,
		p.BrewMethod, p.HarvestYear))
}

// DuplicateCoffee copies coffee srcID into a new draft in the same shop with
// the given name and slug: details (provenance included), flavour notes and every variant (grind,
// weight, price, stock, availability). Photos are not copied (their URLs are
// scoped to the source coffee) and neither are comments. Run it in a
// transaction so a half-copied coffee can't be left behind.
func (s *Store) DuplicateCoffee(ctx context.Context, srcID, name, slug string) (*Coffee, error) {
	co, err := scanCoffee(s.db.QueryRow(ctx, `
		WITH c AS (
			INSERT INTO coffees (shop_id, name, slug, description, origin_country_id, variety_id,
				processing_method_id, roast_level, flavor_notes, producer, region, altitude_min_m, altitude_max_m,
				brew_method, harvest_year)
			SELECT shop_id, $2, $3, description, origin_country_id, variety_id,
				processing_method_id, roast_level, flavor_notes, producer, region, altitude_min_m, altitude_max_m,
				brew_method, harvest_year
			FROM coffees WHERE id = $1
			RETURNING *
		)
		SELECT `+coffeeColumns+` FROM c`, srcID, name, slug))
	if err != nil {
		return nil, err
	}
	if _, err := s.db.Exec(ctx, `
		INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock, is_available)
		SELECT $2, grind, weight_g, price_twd, stock, is_available
		FROM variants WHERE coffee_id = $1`, srcID, co.ID); err != nil {
		return nil, mapErr(err)
	}
	return co, nil
}

// UpdateCoffeeParams holds optional coffee fields; nil means "leave unchanged".
type UpdateCoffeeParams struct {
	Name               *string
	Description        *string
	OriginCountryID    *string
	VarietyID          *string
	ProcessingMethodID *string
	RoastLevel         *string
	ClearRoastLevel    bool     // true sets roast_level to NULL (RoastLevel must be nil)
	FlavorNotes        []string // nil = unchanged; empty slice clears
	ClearVariety       bool     // true sets variety_id to NULL (VarietyID must be nil)
	ImageURLs          []string // nil = unchanged; empty slice clears
	Producer           *string  // "" clears
	Region             *string  // "" clears
	// SetAltitude replaces both altitude columns with AltitudeMinM /
	// AltitudeMaxM (nil = NULL); false leaves them unchanged.
	SetAltitude  bool
	AltitudeMinM *int
	AltitudeMaxM *int
	// SetBrewMethod replaces brew_method with BrewMethod (nil = NULL); false
	// leaves it unchanged.
	SetBrewMethod bool
	BrewMethod    *string
	// SetHarvestYear replaces harvest_year with HarvestYear (nil = NULL);
	// false leaves it unchanged.
	SetHarvestYear bool
	HarvestYear    *int
}

// UpdateCoffee applies a partial update.
func (s *Store) UpdateCoffee(ctx context.Context, id string, p UpdateCoffeeParams) (*Coffee, error) {
	return scanCoffee(s.db.QueryRow(ctx, `
		WITH c AS (
			UPDATE coffees SET
				name                 = COALESCE($2, name),
				description          = COALESCE($3, description),
				origin_country_id    = COALESCE($4, origin_country_id),
				variety_id           = CASE WHEN $9 THEN NULL ELSE COALESCE($5, variety_id) END,
				processing_method_id = COALESCE($6, processing_method_id),
				roast_level          = CASE WHEN $20 THEN NULL ELSE COALESCE($7::roast_level, roast_level) END,
				flavor_notes         = COALESCE($8, flavor_notes),
				image_urls           = COALESCE($10, image_urls),
				producer             = COALESCE($11, producer),
				region               = COALESCE($12, region),
				altitude_min_m       = CASE WHEN $13 THEN $14 ELSE altitude_min_m END,
				altitude_max_m       = CASE WHEN $13 THEN $15 ELSE altitude_max_m END,
				brew_method          = CASE WHEN $16 THEN $17 ELSE brew_method END,
				harvest_year         = CASE WHEN $18 THEN $19::int ELSE harvest_year END
			WHERE id = $1
			RETURNING *
		)
		SELECT `+coffeeColumns+` FROM c`,
		id, p.Name, p.Description, p.OriginCountryID, p.VarietyID, p.ProcessingMethodID,
		p.RoastLevel, p.FlavorNotes, p.ClearVariety, p.ImageURLs,
		p.Producer, p.Region, p.SetAltitude, p.AltitudeMinM, p.AltitudeMaxM, p.SetBrewMethod, p.BrewMethod, p.SetHarvestYear, p.HarvestYear,
		p.ClearRoastLevel))
}

// SetCoffeePublished toggles a coffee's visibility.
func (s *Store) SetCoffeePublished(ctx context.Context, id string, published bool) (*Coffee, error) {
	return scanCoffee(s.db.QueryRow(ctx, `
		WITH c AS (UPDATE coffees SET is_published = $2 WHERE id = $1 RETURNING *)
		SELECT `+coffeeColumns+` FROM c`, id, published))
}

// ShopCoffeeIDsForUpdate returns every coffee of a shop (drafts included) in
// its current lineup order and locks them for the rest of the transaction, so
// a reorder can't race with another reorder. Call it inside InTx.
func (s *Store) ShopCoffeeIDsForUpdate(ctx context.Context, shopID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `SELECT id FROM coffees WHERE shop_id = $1
		ORDER BY shop_position, created_at DESC, id FOR UPDATE`, shopID)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, mapErr(err)
		}
		ids = append(ids, id)
	}
	return ids, mapErr(rows.Err())
}

// SetShopPositions numbers the shop's coffees 1..n in the order of ids. The
// caller checks that ids is exactly the shop's coffees (ShopCoffeeIDsForUpdate).
// Positions don't touch updated_at (migration 014): reordering isn't an edit.
func (s *Store) SetShopPositions(ctx context.Context, shopID string, ids []string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE coffees c SET shop_position = o.pos
		FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, pos)
		WHERE c.id = o.id AND c.shop_id = $1 AND c.shop_position IS DISTINCT FROM o.pos`, shopID, ids)
	return mapErr(err)
}

// ─── Variants ─────────────────────────────────────────────────────────────────

// CreateVariantParams holds a new variant's fields.
type CreateVariantParams struct {
	Grind    string
	WeightG  int
	PriceTWD int64
	Stock    int
}

// CreateVariants inserts variants for a coffee.
func (s *Store) CreateVariants(ctx context.Context, coffeeID string, vs []CreateVariantParams) ([]*Variant, error) {
	out := make([]*Variant, 0, len(vs))
	for _, v := range vs {
		var r Variant
		err := s.db.QueryRow(ctx, `
			INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock)
			VALUES ($1, $2::grind_option, $3, $4, $5)
			RETURNING id, coffee_id, grind, weight_g, price_twd, stock, is_available`,
			coffeeID, v.Grind, v.WeightG, v.PriceTWD, v.Stock,
		).Scan(&r.ID, &r.CoffeeID, &r.Grind, &r.WeightG, &r.PriceTWD, &r.Stock, &r.IsAvailable)
		if err != nil {
			return nil, mapErr(err)
		}
		out = append(out, &r)
	}
	return out, nil
}

// VariantsByCoffeeIDs batch-fetches variants grouped by coffee, ordered by weight then price.
func (s *Store) VariantsByCoffeeIDs(ctx context.Context, coffeeIDs []string) (map[string][]*Variant, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, coffee_id, grind, weight_g, price_twd, stock, is_available
		FROM variants WHERE coffee_id = ANY($1::uuid[])
		ORDER BY weight_g, price_twd, grind, id`, coffeeIDs)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := make(map[string][]*Variant, len(coffeeIDs))
	for rows.Next() {
		var v Variant
		if err := rows.Scan(&v.ID, &v.CoffeeID, &v.Grind, &v.WeightG, &v.PriceTWD, &v.Stock, &v.IsAvailable); err != nil {
			return nil, mapErr(err)
		}
		out[v.CoffeeID] = append(out[v.CoffeeID], &v)
	}
	return out, mapErr(rows.Err())
}

// CountVariants returns how many variants a coffee has.
func (s *Store) CountVariants(ctx context.Context, coffeeID string) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM variants WHERE coffee_id = $1`, coffeeID).Scan(&n)
	return n, mapErr(err)
}

const variantColumns = `id, coffee_id, grind, weight_g, price_twd, stock, is_available`

func scanVariant(row interface{ Scan(...any) error }) (*Variant, error) {
	var v Variant
	if err := row.Scan(&v.ID, &v.CoffeeID, &v.Grind, &v.WeightG, &v.PriceTWD, &v.Stock, &v.IsAvailable); err != nil {
		return nil, mapErr(err)
	}
	return &v, nil
}

// VariantByID fetches one variant.
func (s *Store) VariantByID(ctx context.Context, id string) (*Variant, error) {
	return scanVariant(s.db.QueryRow(ctx, `SELECT `+variantColumns+` FROM variants WHERE id = $1`, id))
}

// DeleteCoffee removes a coffee; its variants and comments cascade (migration
// 001). ErrNotFound if it doesn't exist.
func (s *Store) DeleteCoffee(ctx context.Context, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM coffees WHERE id = $1`, id)
	if err != nil {
		return mapErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// LockCoffee takes a row lock on a coffee for the rest of the transaction, so
// variant-count checks can't race with each other or with publishing. It
// returns whether the coffee is currently published. Call it inside InTx.
func (s *Store) LockCoffee(ctx context.Context, id string) (published bool, err error) {
	err = s.db.QueryRow(ctx, `SELECT is_published FROM coffees WHERE id = $1 FOR UPDATE`, id).Scan(&published)
	return published, mapErr(err)
}

// AddVariant inserts one variant. A duplicate grind+weight for the same
// coffee returns ErrConflict (unique index from migration 004).
func (s *Store) AddVariant(ctx context.Context, coffeeID string, p CreateVariantParams) (*Variant, error) {
	return scanVariant(s.db.QueryRow(ctx, `
		INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock)
		VALUES ($1, $2::grind_option, $3, $4, $5)
		RETURNING `+variantColumns,
		coffeeID, p.Grind, p.WeightG, p.PriceTWD, p.Stock))
}

// UpdateVariantParams holds optional variant fields; nil means "leave unchanged".
type UpdateVariantParams struct {
	PriceTWD    *int64
	Stock       *int
	IsAvailable *bool
}

// UpdateVariant applies a partial update to a variant.
func (s *Store) UpdateVariant(ctx context.Context, id string, p UpdateVariantParams) (*Variant, error) {
	return scanVariant(s.db.QueryRow(ctx, `
		UPDATE variants SET
			price_twd    = COALESCE($2, price_twd),
			stock        = COALESCE($3, stock),
			is_available = COALESCE($4, is_available)
		WHERE id = $1
		RETURNING `+variantColumns,
		id, p.PriceTWD, p.Stock, p.IsAvailable))
}

// DeleteVariant removes a variant. ErrNotFound if it doesn't exist.
func (s *Store) DeleteVariant(ctx context.Context, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM variants WHERE id = $1`, id)
	if err != nil {
		return mapErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
