// Package apperr defines structured, bilingual application errors and the
// gqlgen hooks that turn them into GraphQL errors with a stable `code`
// extension. Resolvers return *apperr.Error values instead of panicking;
// anything else is treated as an internal error and its details are hidden
// from clients.
package apperr

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// Code is a machine-readable error category exposed as extensions.code.
type Code string

const (
	CodeNotFound        Code = "NOT_FOUND"
	CodeUnauthenticated Code = "UNAUTHENTICATED"
	CodeForbidden       Code = "FORBIDDEN"
	CodeBadInput        Code = "BAD_USER_INPUT"
	CodeNotImplemented  Code = "NOT_IMPLEMENTED"
	CodeInternal        Code = "INTERNAL"
)

// Error is a user-facing error with zh-TW (primary) and English messages.
type Error struct {
	Code      Code
	MessageZh string
	MessageEn string
	Field     string // optional: input field that caused the error
	Err       error  // optional: wrapped cause, never shown to clients
}

func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.MessageEn, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.MessageEn)
}

func (e *Error) Unwrap() error { return e.Err }

// NotFound reports a missing entity, e.g. NotFound("咖啡", "coffee").
func NotFound(whatZh, whatEn string) *Error {
	return &Error{
		Code:      CodeNotFound,
		MessageZh: "找不到" + whatZh,
		MessageEn: whatEn + " not found",
	}
}

// BadInput reports an invalid argument.
func BadInput(field, msgZh, msgEn string) *Error {
	return &Error{Code: CodeBadInput, Field: field, MessageZh: msgZh, MessageEn: msgEn}
}

// Unauthenticated reports a missing or invalid access token.
func Unauthenticated() *Error {
	return &Error{
		Code:      CodeUnauthenticated,
		MessageZh: "請先登入",
		MessageEn: "authentication required",
	}
}

// Forbidden reports an authenticated caller lacking permission.
func Forbidden() *Error {
	return &Error{
		Code:      CodeForbidden,
		MessageZh: "沒有權限執行此操作",
		MessageEn: "you do not have permission to do this",
	}
}

// NotImplemented marks an operation deliberately deferred to a later
// iteration. Use instead of panic("not implemented").
func NotImplemented(op string) *Error {
	return &Error{
		Code:      CodeNotImplemented,
		MessageZh: "此功能尚未開放：" + op,
		MessageEn: "not available yet: " + op,
	}
}

// Internal wraps an unexpected error. The cause is logged, never returned.
func Internal(err error) *Error {
	return &Error{
		Code:      CodeInternal,
		MessageZh: "系統發生錯誤，請稍後再試",
		MessageEn: "internal server error",
		Err:       err,
	}
}

// Presenter is a gqlgen ErrorPresenterFunc. It maps *Error to a GraphQL error
// with extensions {code, messageZh, messageEn, field?}; the top-level message
// is the zh-TW text. Unknown errors become INTERNAL and are logged.
func Presenter(ctx context.Context, err error) *gqlerror.Error {
	gqlErr := graphql.DefaultErrorPresenter(ctx, err)

	var appErr *Error
	if !errors.As(err, &appErr) {
		// gqlgen's own validation/parsing errors already carry a useful message
		// and no wrapped cause; keep them as-is.
		var ge *gqlerror.Error
		if errors.As(err, &ge) && ge.Err == nil {
			return gqlErr
		}
		log.Printf("graphql: internal error at %v: %v", gqlErr.Path, err)
		appErr = Internal(err)
	} else if appErr.Code == CodeInternal {
		log.Printf("graphql: internal error at %v: %v", gqlErr.Path, appErr.Err)
	}

	gqlErr.Message = appErr.MessageZh
	ext := map[string]any{
		"code":      string(appErr.Code),
		"messageZh": appErr.MessageZh,
		"messageEn": appErr.MessageEn,
	}
	if appErr.Field != "" {
		ext["field"] = appErr.Field
	}
	gqlErr.Extensions = ext
	return gqlErr
}

// Recover is a gqlgen RecoverFunc: a panicking resolver yields an INTERNAL
// error for that field instead of crashing the request.
func Recover(_ context.Context, p any) error {
	log.Printf("graphql: recovered panic: %v", p)
	return Internal(fmt.Errorf("panic: %v", p))
}
