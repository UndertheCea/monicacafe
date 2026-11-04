package graph

import (
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// Resolver is the root resolver; it holds the application's dependencies.
type Resolver struct {
	Store *store.Store
	Auth  *auth.Service
	refs  *refCache
}

// NewResolver wires the root resolver.
func NewResolver(st *store.Store, authSvc *auth.Service) *Resolver {
	return &Resolver{Store: st, Auth: authSvc, refs: newRefCache(st)}
}
