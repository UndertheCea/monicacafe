package graph

import (
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/storage"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// Resolver is the root resolver; it holds the application's dependencies.
type Resolver struct {
	Store *store.Store
	Auth  *auth.Service
	// Media presigns image uploads; nil when no object store is configured,
	// in which case uploads and new image URLs are rejected.
	Media *storage.Media
	refs  *refCache
}

// NewResolver wires the root resolver. media may be nil.
func NewResolver(st *store.Store, authSvc *auth.Service, media *storage.Media) *Resolver {
	return &Resolver{Store: st, Auth: authSvc, Media: media, refs: newRefCache(st)}
}
