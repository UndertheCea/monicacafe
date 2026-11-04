package graph

import (
	"context"
	"errors"
	"log/slog"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// Error codes exposed to clients in the `extensions.code` field.
const (
	CodeUnauthenticated = "UNAUTHENTICATED"
	CodeForbidden       = "FORBIDDEN"
	CodeNotFound        = "NOT_FOUND"
	CodeBadInput        = "BAD_USER_INPUT"
	CodeConflict        = "CONFLICT"
	CodeInternal        = "INTERNAL_SERVER_ERROR"
)

// apiError is a client-safe error with a machine-readable code.
type apiError struct {
	code    string
	message string
	field   string
}

func (e *apiError) Error() string { return e.message }

func errUnauthenticated() error {
	return &apiError{code: CodeUnauthenticated, message: "authentication required"}
}

func errForbidden(msg string) error { return &apiError{code: CodeForbidden, message: msg} }

func errNotFound(what string) error {
	return &apiError{code: CodeNotFound, message: what + " not found"}
}

func errBadInput(field, msg string) error {
	return &apiError{code: CodeBadInput, message: msg, field: field}
}

func errConflict(field, msg string) error {
	return &apiError{code: CodeConflict, message: msg, field: field}
}

// ErrorPresenter converts resolver errors into GraphQL errors. apiErrors are
// passed through with their code; anything else is logged and replaced with a
// generic message so internal details never leak to clients.
func ErrorPresenter(ctx context.Context, err error) *gqlerror.Error {
	var ae *apiError
	if errors.As(err, &ae) {
		gqlErr := gqlerror.WrapPath(graphql.GetPath(ctx), ae)
		gqlErr.Message = ae.message
		gqlErr.Extensions = map[string]any{"code": ae.code}
		if ae.field != "" {
			gqlErr.Extensions["field"] = ae.field
		}
		return gqlErr
	}
	var gqlErr *gqlerror.Error
	if errors.As(err, &gqlErr) {
		// Parser / validation errors produced by gqlgen itself.
		if gqlErr.Err == nil {
			return gqlErr
		}
		// A gqlerror wrapping one of our errors (e.g. from a field resolver).
		if errors.As(gqlErr.Err, &ae) {
			return ErrorPresenter(ctx, gqlErr.Err)
		}
		if gqlErr.Extensions != nil && gqlErr.Extensions["code"] != nil {
			return gqlErr
		}
	}
	slog.ErrorContext(ctx, "graphql resolver error", "path", graphql.GetPath(ctx).String(), "err", err)
	out := gqlerror.WrapPath(graphql.GetPath(ctx), err)
	out.Message = "internal server error"
	out.Extensions = map[string]any{"code": CodeInternal}
	return out
}

// RecoverFunc converts resolver panics into internal errors.
func RecoverFunc(ctx context.Context, p any) error {
	slog.ErrorContext(ctx, "graphql resolver panic", "panic", p)
	return &apiError{code: CodeInternal, message: "internal server error"}
}
