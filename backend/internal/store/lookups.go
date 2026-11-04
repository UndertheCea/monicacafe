package store

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/underthecea/monicacafe/backend/graph/model"
)

// OriginCountries returns all origins ordered by region then English name.
func (s *Store) OriginCountries(ctx context.Context) ([]*model.OriginCountry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name_en, name_zh, region
		FROM origin_countries ORDER BY region, name_en`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.OriginCountry, error) {
		var o model.OriginCountry
		err := r.Scan(&o.ID, &o.NameEn, &o.NameZh, &o.Region)
		return &o, err
	})
}

// CoffeeVarieties returns all varieties ordered by name.
func (s *Store) CoffeeVarieties(ctx context.Context) ([]*model.CoffeeVariety, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, description FROM coffee_varieties ORDER BY name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.CoffeeVariety, error) {
		var v model.CoffeeVariety
		err := r.Scan(&v.ID, &v.Name, &v.Description)
		return &v, err
	})
}

// ProcessingMethods returns all processing methods ordered by English name.
func (s *Store) ProcessingMethods(ctx context.Context) ([]*model.ProcessingMethod, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name_en, name_zh, description FROM processing_methods ORDER BY name_en`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (*model.ProcessingMethod, error) {
		var p model.ProcessingMethod
		err := r.Scan(&p.ID, &p.NameEn, &p.NameZh, &p.Description)
		return &p, err
	})
}
