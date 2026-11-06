package middleware

import (
	"log/slog"
	"net/http"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// accessLevel picks the log level for a finished request: server errors at
// Error, client errors at Warn, health probes (every few seconds from compose)
// at Debug so they stay out of the default output, everything else at Info.
func accessLevel(path string, status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	case path == "/health":
		return slog.LevelDebug
	default:
		return slog.LevelInfo
	}
}

// AccessLog writes one structured record per request to logger, replacing
// chi's plain-text Logger so access lines share the app's JSON format. The
// path is logged without its query string (it can carry tokens). Mount it
// after RequestID and ClientIPMiddleware, and before Recoverer so a
// recovered panic is logged as the 500 it became.
func AccessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			status := ww.Status()
			if status == 0 {
				status = http.StatusOK // nothing written: net/http sends 200
			}
			ctx := r.Context()
			level := accessLevel(r.URL.Path, status)
			if !logger.Enabled(ctx, level) {
				return
			}
			logger.LogAttrs(ctx, level, "http request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", status),
				slog.Int("bytes", ww.BytesWritten()),
				slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
				slog.String("request_id", chimiddleware.GetReqID(ctx)),
				slog.String("client_ip", ClientIPFrom(ctx)),
			)
		})
	}
}
