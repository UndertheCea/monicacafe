package graph

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/underthecea/monicacafe/backend/internal/apperr"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// UserIDFromContext returns the authenticated user's ID, or "" when the
// request carried no valid access token.
func UserIDFromContext(ctx context.Context) string {
	if c := middleware.ClaimsFromContext(ctx); c != nil {
		return c.UserID
	}
	return ""
}

// validID checks an optional UUID argument; empty/nil is allowed.
func validID(field string, id *string) error {
	if id == nil || *id == "" {
		return nil
	}
	if _, err := uuid.Parse(*id); err != nil {
		return apperr.BadInput(field, "ID 格式錯誤", "invalid ID format")
	}
	return nil
}

// dbErr converts a store error into an apperr; ErrNotFound → NOT_FOUND.
func dbErr(err error, whatZh, whatEn string) error {
	if errors.Is(err, store.ErrNotFound) {
		return apperr.NotFound(whatZh, whatEn)
	}
	return apperr.Internal(err)
}
