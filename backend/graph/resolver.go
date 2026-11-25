package graph

import (
	"context"
	"log/slog"

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
	// UploadDailyBytes is the bytes of images one shop may presign per rolling
	// 24 hours (#217); 0 = unlimited.
	UploadDailyBytes int64
	refs             *refCache
}

// Limits are the rate limiters. The *IP ones are keyed by client IP (see
// middleware.ClientIPMiddleware), LoginEmail by the normalised email and the
// *User ones by the signed-in user's ID.
type Limits struct {
	LoginIP    *ratelimit.Limiter
	LoginEmail *ratelimit.Limiter
	// LoginEmailIP counts failed logins per email + client address (#213).
	LoginEmailIP *ratelimit.Limiter
	RegisterIP   *ratelimit.Limiter
	RefreshIP    *ratelimit.Limiter

	CommentUser  *ratelimit.Limiter
	UploadUser   *ratelimit.Limiter
	PasswordUser *ratelimit.Limiter
	SaveUser     *ratelimit.Limiter
	// ReportUser counts reports filed (#225).
	ReportUser *ratelimit.Limiter
	// SellerWriteUser covers every shop / coffee / option mutation (#213), so
	// one account can't flood the catalogue or the map.
	SellerWriteUser *ratelimit.Limiter
	// ExportUser counts "download my data" exports (#270).
	ExportUser *ratelimit.Limiter
	// CartUser counts cart writes (add / change / remove, #21).
	CartUser *ratelimit.Limiter
	// AccountWriteUser covers writes with no bucket of their own: deleteComment,
	// logoutEverywhere and every admin mutation (#283).
	AccountWriteUser *ratelimit.Limiter
	// ProfileUser counts display-name changes (#286).
	ProfileUser *ratelimit.Limiter
}

// allowIP spends a token for the request's client IP. Requests whose IP is
// unknown (no ClientIPMiddleware, e.g. unix sockets) aren't limited.
func allowIP(ctx context.Context, l *ratelimit.Limiter) error {
	ip := middleware.ClientIPFrom(ctx)
	if ip == "" {
		return nil
	}
	if ok, retry := l.Allow(ratelimit.IPKey(ip)); !ok {
		return errRateLimited(retry)
	}
	return nil
}

// loginEmailIPKey keys failed logins by account and client address (IPv6 by
// its /64).
func loginEmailIPKey(ctx context.Context, email string) string {
	return email + "|" + ratelimit.IPKey(middleware.ClientIPFrom(ctx))
}

// rehashPassword upgrades a hash made at an older bcrypt cost while the
// password is at hand (#213). A failure only leaves the old hash in place.
func (r *Resolver) rehashPassword(ctx context.Context, u *store.User, password string) {
	if !auth.NeedsRehash(u.PasswordHash) {
		return
	}
	h, err := auth.Rehash(password)
	if err == nil {
		err = r.Store.RehashPassword(ctx, u.ID, u.PasswordHash, h)
	}
	if err != nil {
		slog.WarnContext(ctx, "password rehash failed", "user", u.ID, "err", err)
	}
}

// reserveKeys spends one token from each limiter before the slow work starts,
// so parallel requests can't all pass a check before any is charged (#526). If
// either refuses, the token already taken is refunded. The caller keeps the
// reservation for outcomes it counts and calls the returned release otherwise.
func reserveKeys(emailKey, emailIPKey string, email, emailIP *ratelimit.Limiter) (release func(), err error) {
	if ok, retry := email.Allow(emailKey); !ok {
		return nil, errRateLimited(retry)
	}
	if ok, retry := emailIP.Allow(emailIPKey); !ok {
		email.Refund(emailKey)
		return nil, errRateLimited(retry)
	}
	return func() {
		email.Refund(emailKey)
		emailIP.Refund(emailIPKey)
	}, nil
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
