package graph

import "github.com/underthecea/monicacafe/backend/internal/store"

// This file will not be regenerated automatically.
//
// Resolver is the dependency-injection root shared by all resolvers.
type Resolver struct {
	Store *store.Store
}
