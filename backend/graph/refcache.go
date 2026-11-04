package graph

import (
	"context"
	"sync"
	"time"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// refTTL bounds how stale curated reference data may be. The tables are
// seeded by migrations and change rarely, so a short TTL keeps lookups free.
const refTTL = 5 * time.Minute

// refCache memoises the curated dropdown tables (origin countries, varieties,
// processing methods) in memory.
type refCache struct {
	st *store.Store

	mu        sync.Mutex
	loadedAt  time.Time
	origins   []*model.OriginCountry
	varieties []*model.CoffeeVariety
	methods   []*model.ProcessingMethod
	originBy  map[string]*model.OriginCountry
	varietyBy map[string]*model.CoffeeVariety
	methodBy  map[string]*model.ProcessingMethod
}

func newRefCache(st *store.Store) *refCache { return &refCache{st: st} }

type refSnapshot struct {
	origins   []*model.OriginCountry
	varieties []*model.CoffeeVariety
	methods   []*model.ProcessingMethod
	originBy  map[string]*model.OriginCountry
	varietyBy map[string]*model.CoffeeVariety
	methodBy  map[string]*model.ProcessingMethod
}

func (c *refCache) get(ctx context.Context) (*refSnapshot, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.originBy == nil || time.Since(c.loadedAt) > refTTL {
		if err := c.reload(ctx); err != nil {
			return nil, err
		}
	}
	return &refSnapshot{
		origins: c.origins, varieties: c.varieties, methods: c.methods,
		originBy: c.originBy, varietyBy: c.varietyBy, methodBy: c.methodBy,
	}, nil
}

func (c *refCache) reload(ctx context.Context) error {
	ocs, err := c.st.OriginCountries(ctx)
	if err != nil {
		return err
	}
	vs, err := c.st.CoffeeVarieties(ctx)
	if err != nil {
		return err
	}
	ms, err := c.st.ProcessingMethods(ctx)
	if err != nil {
		return err
	}
	c.origins = make([]*model.OriginCountry, 0, len(ocs))
	c.originBy = make(map[string]*model.OriginCountry, len(ocs))
	for _, o := range ocs {
		m := &model.OriginCountry{ID: o.ID, NameEn: o.NameEn, NameZh: o.NameZh, Region: o.Region}
		c.origins = append(c.origins, m)
		c.originBy[m.ID] = m
	}
	c.varieties = make([]*model.CoffeeVariety, 0, len(vs))
	c.varietyBy = make(map[string]*model.CoffeeVariety, len(vs))
	for _, v := range vs {
		m := &model.CoffeeVariety{ID: v.ID, Name: v.Name, Description: v.Description}
		c.varieties = append(c.varieties, m)
		c.varietyBy[m.ID] = m
	}
	c.methods = make([]*model.ProcessingMethod, 0, len(ms))
	c.methodBy = make(map[string]*model.ProcessingMethod, len(ms))
	for _, p := range ms {
		m := &model.ProcessingMethod{ID: p.ID, NameEn: p.NameEn, NameZh: p.NameZh, Description: p.Description}
		c.methods = append(c.methods, m)
		c.methodBy[m.ID] = m
	}
	c.loadedAt = time.Now()
	return nil
}
