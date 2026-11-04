package graph

import (
	"context"
	"net/http"
	"time"

	"github.com/vikstrous/dataloadgen"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

// Loaders batches relationship lookups made while resolving a single request,
// turning N per-row queries into one query per relationship.
type Loaders struct {
	UserByID             *dataloadgen.Loader[string, *store.User]
	ShopByID             *dataloadgen.Loader[string, *store.Shop]
	VariantsByCoffeeID   *dataloadgen.Loader[string, []*store.Variant]
	CommentCountByCoffee *dataloadgen.Loader[string, int]
}

type loadersKey struct{}

const loaderWait = 2 * time.Millisecond

// NewLoaders builds a fresh set of request-scoped loaders.
func NewLoaders(st *store.Store) *Loaders {
	return &Loaders{
		UserByID: dataloadgen.NewMappedLoader(st.UsersByIDs, dataloadgen.WithWait(loaderWait)),
		ShopByID: dataloadgen.NewMappedLoader(st.ShopsByIDs, dataloadgen.WithWait(loaderWait)),
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
		CommentCountByCoffee: dataloadgen.NewLoader(func(ctx context.Context, ids []string) ([]int, []error) {
			m, err := st.CommentCountsByCoffeeIDs(ctx, ids)
			out := make([]int, len(ids))
			if err != nil {
				return out, fillErr(len(ids), err)
			}
			for i, id := range ids {
				out[i] = m[id]
			}
			return out, nil
		}, dataloadgen.WithWait(loaderWait)),
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
