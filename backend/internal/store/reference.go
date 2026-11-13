package store

import "context"

// OriginCountries lists all origin countries grouped by region, then English name.
func (s *Store) OriginCountries(ctx context.Context) ([]*OriginCountry, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name_en, name_zh, region FROM origin_countries ORDER BY region, name_en`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*OriginCountry
	for rows.Next() {
		var o OriginCountry
		if err := rows.Scan(&o.ID, &o.NameEn, &o.NameZh, &o.Region); err != nil {
			return nil, mapErr(err)
		}
		out = append(out, &o)
	}
	return out, mapErr(rows.Err())
}

// CoffeeVarieties lists all varieties by name.
func (s *Store) CoffeeVarieties(ctx context.Context) ([]*CoffeeVariety, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, description FROM coffee_varieties ORDER BY name`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*CoffeeVariety
	for rows.Next() {
		var v CoffeeVariety
		if err := rows.Scan(&v.ID, &v.Name, &v.Description); err != nil {
			return nil, mapErr(err)
		}
		out = append(out, &v)
	}
	return out, mapErr(rows.Err())
}

// ProcessingMethods lists all processing methods by English name.
func (s *Store) ProcessingMethods(ctx context.Context) ([]*ProcessingMethod, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name_en, name_zh, description FROM processing_methods ORDER BY name_en`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*ProcessingMethod
	for rows.Next() {
		var p ProcessingMethod
		if err := rows.Scan(&p.ID, &p.NameEn, &p.NameZh, &p.Description); err != nil {
			return nil, mapErr(err)
		}
		out = append(out, &p)
	}
	return out, mapErr(rows.Err())
}

// ReferenceCoffeeCounts is how many published coffees use each origin country,
// variety and processing method. Keys absent from a map have no published
// coffees. One grouped scan of coffees, so the filter dropdowns can label or
// hide values without a query per option.
type ReferenceCoffeeCounts struct {
	Origins   map[string]int
	Varieties map[string]int
	Methods   map[string]int
}

// PublishedCoffeeCountsByReference counts published coffees per origin,
// variety and processing method (drafts never count).
func (s *Store) PublishedCoffeeCountsByReference(ctx context.Context) (*ReferenceCoffeeCounts, error) {
	rows, err := s.db.Query(ctx, `
		SELECT origin_country_id::text, variety_id::text, processing_method_id::text, count(*)
		FROM coffees c
		WHERE `+publicCoffee+`
		GROUP BY GROUPING SETS ((origin_country_id), (variety_id), (processing_method_id))`)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	out := &ReferenceCoffeeCounts{Origins: map[string]int{}, Varieties: map[string]int{}, Methods: map[string]int{}}
	for rows.Next() {
		var (
			origin, variety, method *string
			n                       int
		)
		if err := rows.Scan(&origin, &variety, &method, &n); err != nil {
			return nil, mapErr(err)
		}
		addReferenceCount(out, origin, variety, method, n)
	}
	return out, mapErr(rows.Err())
}

// addReferenceCount files one GROUPING SETS row: exactly one of the three ids
// is set (the set it was grouped by); a row with none is the "no variety"
// group, which no dropdown option matches.
func addReferenceCount(c *ReferenceCoffeeCounts, origin, variety, method *string, n int) {
	switch {
	case origin != nil:
		c.Origins[*origin] += n
	case variety != nil:
		c.Varieties[*variety] += n
	case method != nil:
		c.Methods[*method] += n
	}
}
