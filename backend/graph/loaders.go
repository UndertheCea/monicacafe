package graph

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/vikstrous/dataloadgen"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// Loaders batches relationship lookups made while resolving a single request,
// turning N per-row queries into one query per relationship.
type Loaders struct {
	UserByID             *dataloadgen.Loader[string, *store.User]
	ShopByID             *dataloadgen.Loader[string, *store.Shop]
	CoffeeByID           *dataloadgen.Loader[string, *store.Coffee]
	VariantsByCoffeeID   *dataloadgen.Loader[string, []*store.Variant]
	CommentCountByCoffee *dataloadgen.Loader[string, int]
	CoffeeCountByShop    *dataloadgen.Loader[string, int]
	SaveCountByCoffee    *dataloadgen.Loader[string, int]
	// SavedByCoffee answers Coffee.isSaved for the request's viewer (the
	// loader is request-scoped, so there is only ever one viewer).
	SavedByCoffee       *dataloadgen.Loader[string, bool]
	FollowerCountByShop *dataloadgen.Loader[string, int]
	// FollowedByShop answers Shop.isFollowed for the request's viewer.
	FollowedByShop *dataloadgen.Loader[string, bool]
	// RefCounts answers coffeeCount on origin countries, varieties and
	// processing methods: one grouped query per request, however many options
	// are listed.
	RefCounts func(context.Context) (*store.ReferenceCoffeeCounts, error)
}

type loadersKey struct{}

const loaderWait = 2 * time.Millisecond

// NewLoaders builds a fresh set of request-scoped loaders.
func NewLoaders(st *store.Store) *Loaders {
	return &Loaders{
		UserByID:   dataloadgen.NewMappedLoader(st.UsersByIDs, dataloadgen.WithWait(loaderWait)),
		ShopByID:   dataloadgen.NewMappedLoader(st.ShopsByIDs, dataloadgen.WithWait(loaderWait)),
		CoffeeByID: dataloadgen.NewMappedLoader(st.CoffeesByIDs, dataloadgen.WithWait(loaderWait)),
		VariantsByCoffeeID: dataloadgen.NewLoader(func(ctx context.Context, ids []string) ([][]*store.Variant, []error) {
			m, err := st.VariantsByCoffeeIDs(ctx, ids)
			out := make([][]*store.Variant, len(ids))
			if err != nil {
				return out, fillErr(len(ids), err)
			}
			for i, id := range ids {
				out[i] = m[id]
			}
			return out, nil
		}, dataloadgen.WithWait(loaderWait)),
		CommentCountByCoffee: dataloadgen.NewLoader(countLoader(st.CommentCountsByCoffeeIDs), dataloadgen.WithWait(loaderWait)),
		CoffeeCountByShop:    dataloadgen.NewLoader(countLoader(st.PublishedCoffeeCountsByShopIDs), dataloadgen.WithWait(loaderWait)),
		SaveCountByCoffee:    dataloadgen.NewLoader(countLoader(st.SaveCountsByCoffeeIDs), dataloadgen.WithWait(loaderWait)),
		SavedByCoffee:        dataloadgen.NewLoader(viewerFlagLoader(st.SavedCoffeeIDs), dataloadgen.WithWait(loaderWait)),
		FollowerCountByShop:  dataloadgen.NewLoader(countLoader(st.FollowerCountsByShopIDs), dataloadgen.WithWait(loaderWait)),
		FollowedByShop:       dataloadgen.NewLoader(viewerFlagLoader(st.FollowedShopIDs), dataloadgen.WithWait(loaderWait)),
		RefCounts:            onceLoader(st.PublishedCoffeeCountsByReference),
	}
}

// onceLoader runs load at most once per request (the Loaders are request
// scoped) and hands every caller the same result. The first caller's context
// runs the query.
func onceLoader[T any](load func(context.Context) (T, error)) func(context.Context) (T, error) {
	var (
		once sync.Once
		val  T
		err  error
	)
	return func(ctx context.Context) (T, error) {
		once.Do(func() { val, err = load(ctx) })
		return val, err
	}
}

// viewerFlagLoader adapts a per-user batch membership query (saved, followed)
// to a loader for the request's viewer; signed out, every flag is false.
func viewerFlagLoader(batch func(context.Context, string, []string) (map[string]bool, error)) func(context.Context, []string) ([]bool, []error) {
	return func(ctx context.Context, ids []string) ([]bool, []error) {
		out := make([]bool, len(ids))
		c := viewer(ctx)
		if c == nil {
			return out, nil
		}
		m, err := batch(ctx, c.UserID, ids)
		if err != nil {
			return out, fillErr(len(ids), err)
		}
		for i, id := range ids {
			out[i] = m[id]
		}
		return out, nil
	}
}

// countLoader adapts a batch count query (absent keys mean zero) to a loader.
func countLoader(batch func(context.Context, []string) (map[string]int, error)) func(context.Context, []string) ([]int, []error) {
	return func(ctx context.Context, ids []string) ([]int, []error) {
		m, err := batch(ctx, ids)
		out := make([]int, len(ids))
		if err != nil {
			return out, fillErr(len(ids), err)
		}
		for i, id := range ids {
			out[i] = m[id]
		}
		return out, nil
	}
}

func fillErr(n int, err error) []error {
	errs := make([]error, n)
	for i := range errs {
		errs[i] = err
	}
	return errs
}

// LoaderMiddleware attaches a fresh Loaders to every request context.
func LoaderMiddleware(st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), loadersKey{}, NewLoaders(st))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// loadersFor returns the request's loaders, creating an unshared set if the
// middleware was not installed (e.g. in tests).
func (r *Resolver) loadersFor(ctx context.Context) *Loaders {
	if l, ok := ctx.Value(loadersKey{}).(*Loaders); ok {
		return l
	}
	return NewLoaders(r.Store)
}
