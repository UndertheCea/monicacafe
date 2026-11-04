package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/platform/money"
)

// coffeeSelect joins everything a Coffee node needs except variants and
// comments (which have their own field resolvers).
const coffeeCols = `
c.id::text, c.name, c.slug, c.description, c.roast_level::text,
       c.flavor_notes, c.image_urls, c.is_published, c.created_at,
       ` + shopCols + `,
       oc.id::text, oc.name_en, oc.name_zh, oc.region,
       cv.id::text, cv.name, cv.description,
       pm.id::text, pm.name_en, pm.name_zh, pm.description`

const coffeeFrom = `
FROM coffees c
JOIN shops s               ON s.id  = c.shop_id
JOIN origin_countries oc   ON oc.id = c.origin_country_id
LEFT JOIN coffee_varieties cv ON cv.id = c.variety_id
JOIN processing_methods pm ON pm.id = c.processing_method_id`

const coffeeSelect = "SELECT " + coffeeCols + coffeeFrom

// scanCoffee scans a coffeeCols row; extra receives any trailing columns.
func scanCoffee(r pgx.Row, extra ...any) (*model.Coffee, error) {
	var (
		c     model.Coffee
		sh    model.Shop
		oc    model.OriginCountry
		pm    model.ProcessingMethod
		roast string
		cvID  *string
		cvNm  *string
		cvDsc *string
	)
	dest := []any{&c.ID, &c.Name, &c.Slug, &c.Description, &roast,
		&c.FlavorNotes, &c.ImageUrls, &c.IsPublished, &c.CreatedAt,
		&sh.ID, &sh.Slug, &sh.Name, &sh.Description, &sh.LogoURL, &sh.BannerURL,
		&sh.City, &sh.Lat, &sh.Lng, &sh.CreatedAt,
		&oc.ID, &oc.NameEn, &oc.NameZh, &oc.Region,
		&cvID, &cvNm, &cvDsc,
		&pm.ID, &pm.NameEn, &pm.NameZh, &pm.Description}
	err := r.Scan(append(dest, extra...)...)
	if err != nil {
		return nil, err
	}
	c.RoastLevel = model.RoastLevel(roast)
	c.Shop, c.OriginCountry, c.ProcessingMethod = &sh, &oc, &pm
	if cvID != nil {
		c.Variety = &model.CoffeeVariety{ID: *cvID, Name: deref(cvNm), Description: cvDsc}
	}
	if c.FlavorNotes == nil {
		c.FlavorNotes = []string{}
	}
	if c.ImageUrls == nil {
		c.ImageUrls = []string{}
	}
	return &c, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// escapeLike escapes LIKE metacharacters so user input matches literally.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// CoffeeQuery describes a coffee listing request.
type CoffeeQuery struct {
	Filter  *model.CoffeeFilter
	ShopID  string // optional: restrict to one shop
	Limit   int
	Offset  int
	OnlyPub bool // only published coffees (always true for public listings)
}

// buildCoffeeWhere returns a WHERE clause (including the keyword, or "" when
// empty) and its positional args. Kept pure so it can be unit-tested.
func buildCoffeeWhere(q CoffeeQuery) (string, []any) {
	var conds []string
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if q.OnlyPub {
		conds = append(conds, "c.is_published")
	}
	if q.ShopID != "" {
		add("c.shop_id = $%d::uuid", q.ShopID)
	}
	if f := q.Filter; f != nil {
		if f.OriginCountryID != nil && *f.OriginCountryID != "" {
			add("c.origin_country_id = $%d::uuid", *f.OriginCountryID)
		}
		if f.VarietyID != nil && *f.VarietyID != "" {
			add("c.variety_id = $%d::uuid", *f.VarietyID)
		}
		if f.ProcessingMethodID != nil && *f.ProcessingMethodID != "" {
			add("c.processing_method_id = $%d::uuid", *f.ProcessingMethodID)
		}
		if f.RoastLevel != nil {
			add("c.roast_level = $%d::roast_level", string(*f.RoastLevel))
		}
		if f.FlavorNote != nil && strings.TrimSpace(*f.FlavorNote) != "" {
			add("EXISTS (SELECT 1 FROM unnest(c.flavor_notes) fn WHERE fn ILIKE '%%' || $%d || '%%')",
				escapeLike(strings.TrimSpace(*f.FlavorNote)))
		}
		// Price bounds must be satisfied by the same available variant.
		if f.MinPriceTwd != nil || f.MaxPriceTwd != nil {
			var pc []string
			if f.MinPriceTwd != nil {
				args = append(args, *f.MinPriceTwd)
				pc = append(pc, fmt.Sprintf("v.price_twd >= $%d", len(args)))
			}
			if f.MaxPriceTwd != nil {
				args = append(args, *f.MaxPriceTwd)
				pc = append(pc, fmt.Sprintf("v.price_twd <= $%d", len(args)))
			}
			conds = append(conds, "EXISTS (SELECT 1 FROM variants v WHERE v.coffee_id = c.id AND v.is_available AND "+
				strings.Join(pc, " AND ")+")")
		}
	}
	if len(conds) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// ListCoffees returns a page of coffees (newest first) and the total count.
func (s *Store) ListCoffees(ctx context.Context, q CoffeeQuery) ([]*model.Coffee, int, error) {
	where, args := buildCoffeeWhere(q)
	var total int
	if err := s.pool.QueryRow(ctx, "SELECT count(*) FROM coffees c"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	n := len(args)
	rows, err := s.pool.Query(ctx,
		coffeeSelect+where+fmt.Sprintf(" ORDER BY c.created_at DESC, c.id LIMIT $%d OFFSET $%d", n+1, n+2),
		append(args, q.Limit, q.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	coffees, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.Coffee, error) { return scanCoffee(r) })
	return coffees, total, err
}

// PopularCoffees returns published coffees ranked by comment count.
func (s *Store) PopularCoffees(ctx context.Context, limit int) ([]*model.Coffee, error) {
	rows, err := s.pool.Query(ctx, coffeeSelect+`
		WHERE c.is_published
		ORDER BY (SELECT count(*) FROM comments cm WHERE cm.coffee_id = c.id) DESC,
		         c.created_at DESC, c.id
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.Coffee, error) { return scanCoffee(r) })
}

// CoffeeByID returns the coffee regardless of publish state, plus the
// owner's user ID so callers can decide visibility.
func (s *Store) CoffeeByID(ctx context.Context, id string) (*model.Coffee, string, error) {
	var owner string
	row := s.pool.QueryRow(ctx, "SELECT "+coffeeCols+", s.owner_id::text"+coffeeFrom+
		" WHERE c.id = $1::uuid", id)
	c, err := scanCoffee(row, &owner)
	if err != nil {
		return nil, "", notFound(err)
	}
	return c, owner, nil
}

// VariantsByCoffee returns the purchasable options for a coffee, cheapest first.
func (s *Store) VariantsByCoffee(ctx context.Context, coffeeID string) ([]*model.Variant, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, grind::text, weight_g, price_twd, stock, is_available
		FROM variants WHERE coffee_id = $1::uuid
		ORDER BY weight_g, price_twd, grind`, coffeeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.Variant, error) {
		var (
			v     model.Variant
			grind string
			price int64
		)
		err := r.Scan(&v.ID, &grind, &v.WeightG, &price, &v.Stock, &v.IsAvailable)
		v.Grind, v.PriceTwd = model.GrindOption(grind), money.TWD(price)
		return &v, err
	})
}

// CommentsByCoffee returns comments oldest first, with their authors.
// Author emails are deliberately not selected: comments are public and
// users' contact details must never be exposed (User.email is "" here).
func (s *Store) CommentsByCoffee(ctx context.Context, coffeeID string) ([]*model.Comment, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT cm.id::text, cm.body, cm.created_at,
		       u.id::text, u.display_name, u.role::text, u.created_at
		FROM comments cm JOIN users u ON u.id = cm.user_id
		WHERE cm.coffee_id = $1::uuid
		ORDER BY cm.created_at, cm.id`, coffeeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.Comment, error) {
		var (
			c    model.Comment
			u    model.User
			role string
		)
		err := r.Scan(&c.ID, &c.Body, &c.CreatedAt, &u.ID, &u.DisplayName, &role, &u.CreatedAt)
		u.Role = model.UserRole(role)
		c.User = &u
		return &c, err
	})
}

// CommentCount returns the number of comments on a coffee.
func (s *Store) CommentCount(ctx context.Context, coffeeID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM comments WHERE coffee_id = $1::uuid`, coffeeID).Scan(&n)
	return n, err
}
