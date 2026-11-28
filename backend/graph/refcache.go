package graph

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// refTTL bounds how stale curated reference data may be. The tables are
// seeded by migrations and change rarely, so a short TTL keeps lookups free.
const refTTL = 5 * time.Minute

// refRetry is how long a warm cache keeps serving its old snapshot after a
// failed reload before it tries the database again (#575).
const refRetry = 10 * time.Second

// refCache memoises the curated dropdown tables (origin countries, varieties,
// processing methods) in memory. Snapshots are immutable: a reload builds a
// new one outside the lock and swaps it in, so readers never wait for the
// database once the cache is warm, and a failed reload keeps the old one.
type refCache struct {
	load func(context.Context) (*refSnapshot, error)
	now  func() time.Time

	reloading sync.Mutex // one reload at a time

	mu       sync.Mutex // guards the three fields below
	snap     *refSnapshot
	loadedAt time.Time
	retryAt  time.Time // after a failed reload: don't try again before this
}

func newRefCache(st *store.Store) *refCache {
	return &refCache{load: func(ctx context.Context) (*refSnapshot, error) { return loadRefs(ctx, st) }, now: time.Now}
}

type refSnapshot struct {
	origins   []*model.OriginCountry
	varieties []*model.CoffeeVariety
	methods   []*model.ProcessingMethod
	originBy  map[string]*model.OriginCountry
	varietyBy map[string]*model.CoffeeVariety
	methodBy  map[string]*model.ProcessingMethod
}

// state reports the current snapshot and whether it should be reloaded now.
func (c *refCache) state() (*refSnapshot, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	stale := c.snap == nil || now.Sub(c.loadedAt) > refTTL
	return c.snap, stale && !now.Before(c.retryAt)
}

// get returns the reference lists. A cold cache waits for the database and
// returns its error; a warm one serves its snapshot while another caller
// reloads, and keeps serving it (logging a warning) when the reload fails.
func (c *refCache) get(ctx context.Context) (*refSnapshot, error) {
	snap, due := c.state()
	if !due && snap != nil {
		return snap, nil
	}
	if snap != nil {
		if !c.reloading.TryLock() {
			return snap, nil // someone else is reloading
		}
	} else {
		c.reloading.Lock()
	}
	defer c.reloading.Unlock()
	// Another caller may have finished a reload while we waited for the lock.
	if cur, due := c.state(); !due && cur != nil {
		return cur, nil
	}
	fresh, err := c.load(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		if c.snap == nil {
			return nil, err
		}
		c.retryAt = c.now().Add(refRetry)
		slog.WarnContext(ctx, "reference lists reload failed; serving the cached ones", "err", err)
		return c.snap, nil
	}
	c.snap, c.loadedAt, c.retryAt = fresh, c.now(), time.Time{}
	return fresh, nil
}

// loadRefs reads the three reference tables into a new snapshot.
func loadRefs(ctx context.Context, st *store.Store) (*refSnapshot, error) {
	ocs, err := st.OriginCountries(ctx)
	if err != nil {
		return nil, err
	}
	vs, err := st.CoffeeVarieties(ctx)
	if err != nil {
		return nil, err
	}
	ms, err := st.ProcessingMethods(ctx)
	if err != nil {
		return nil, err
	}
	c := &refSnapshot{}
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
	return c, nil
}
