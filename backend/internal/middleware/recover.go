package middleware

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// Recover turns a panic in a later handler into a 500 and one structured
// Error record (panic value, stack, method, path, request_id), replacing chi's
// Recoverer, whose multi-line text dump log collectors can't parse. GraphQL
// resolver panics are already recovered by gqlgen (graph.RecoverFunc); this
// catches everything else (middleware, loaders, other routes).
//
// http.ErrAbortHandler is re-panicked so net/http aborts the response as it
// expects. If the handler already sent headers, nothing more is written (the
// status can't change); the record still says so.
func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}
				if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(rec)
				}
				sent := ww.Status() != 0
				ctx := r.Context()
				logger.LogAttrs(ctx, slog.LevelError, "panic recovered",
					slog.String("panic", panicText(rec)),
					slog.String("stack", string(debug.Stack())),
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.String("request_id", chimiddleware.GetReqID(ctx)),
					slog.Bool("headers_sent", sent),
				)
				if !sent {
					http.Error(ww, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(ww, r)
		})
	}
}

func panicText(v any) string {
	switch p := v.(type) {
	case error:
		return p.Error()
	case string:
		return p
	default:
		return fmt.Sprint(p)
	}
}
