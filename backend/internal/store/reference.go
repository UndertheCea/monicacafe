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
