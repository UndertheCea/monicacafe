package graph

import (
	"context"

	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
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
	// Limits throttles the public auth mutations; nil limiters allow all.
	Limits Limits
	refs   *refCache
}

// Limits are the rate limiters. The *IP ones are keyed by client IP (see
// middleware.ClientIPMiddleware), LoginEmail by the normalised email and the
// *User ones by the signed-in user's ID.
type Limits struct {
	LoginIP    *ratelimit.Limiter
	LoginEmail *ratelimit.Limiter
	RegisterIP *ratelimit.Limiter
	RefreshIP  *ratelimit.Limiter

	CommentUser  *ratelimit.Limiter
	UploadUser   *ratelimit.Limiter
	PasswordUser *ratelimit.Limiter
}

// allowIP spends a token for the request's client IP. Requests whose IP is
// unknown (no ClientIPMiddleware, e.g. unix sockets) aren't limited.
func allowIP(ctx context.Context, l *ratelimit.Limiter) error {
	ip := middleware.ClientIPFrom(ctx)
	if ip == "" {
		return nil
	}
	if ok, retry := l.Allow(ip); !ok {
		return errRateLimited(retry)
	}
	return nil
}

func allowKey(l *ratelimit.Limiter, key string) error {
	if ok, retry := l.Allow(key); !ok {
		return errRateLimited(retry)
	}
	return nil
}

// NewResolver wires the root resolver. media may be nil.
func NewResolver(st *store.Store, authSvc *auth.Service, media *storage.Media) *Resolver {
	return &Resolver{Store: st, Auth: authSvc, Media: media, refs: newRefCache(st)}
}
