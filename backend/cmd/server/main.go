package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/99designs/gqlgen/graphql"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/db"
	"github.com/underthecea/monicacafe/backend/internal/errreport"
	"github.com/underthecea/monicacafe/backend/internal/health"
	"github.com/underthecea/monicacafe/backend/internal/mediaclean"
	"github.com/underthecea/monicacafe/backend/internal/metrics"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/platform/config"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
	"github.com/underthecea/monicacafe/backend/internal/storage"
	"github.com/underthecea/monicacafe/backend/internal/store"
	"github.com/underthecea/monicacafe/backend/internal/sweep"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	maxConns, stmtTimeout, _ := cfg.DBPool() // checked by cfg.Validate
	pool, err := db.New(ctx, cfg.DatabaseURL, db.Options{MaxConns: maxConns, StatementTimeout: stmtTimeout})
	if err != nil {
		return err
	}
	defer pool.Close() // runs last: the sweeps are awaited before this (see below)

	m := metrics.New()
	m.RegisterPool(pool)
	reporter, err := errreport.New(errreport.Options{DSN: cfg.SentryDSN, Environment: cfg.AppEnv, Release: cfg.SentryRelease})
	if err != nil {
		return err
	}
	defer func() {
		flush, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		reporter.Close(flush)
	}()

	st := store.New(pool)
	authSvc := auth.NewService(cfg.JWTAccessSecret, cfg.JWTRefreshSecret)
	media, err := storage.New(storage.Config{
		Endpoint: cfg.S3Endpoint, Bucket: cfg.S3Bucket, Region: cfg.S3Region,
		AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, PublicURL: cfg.MediaPublicURL,
		InternalEndpoint: cfg.S3InternalEndpoint,
	})
	if err != nil {
		return err
	}
	if media == nil {
		slog.Warn("image uploads disabled: S3_ACCESS_KEY / S3_SECRET_KEY not set")
	}
	resolver := graph.NewResolver(st, authSvc, media)
	resolver.UploadDailyBytes, _ = cfg.UploadDailyBytes() // checked by cfg.Validate
	rules, _ := cfg.RateLimits()                          // checked by cfg.Validate
	// lim builds one limiter and counts its rejections under the bucket name.
	lim := func(bucket string, rule ratelimit.Rule) *ratelimit.Limiter {
		l := ratelimit.New(rule)
		l.OnReject(m.RateLimitRejected(bucket))
		return l
	}
	resolver.Limits = graph.Limits{
		LoginIP:      lim("login_ip", rules.LoginIP),
		LoginEmail:   lim("login_email", rules.LoginEmail),
		LoginEmailIP: lim("login_email_ip", rules.LoginEmailIP),
		RegisterIP:   lim("register_ip", rules.RegisterIP),
		RefreshIP:    lim("refresh_ip", rules.RefreshIP),

		CommentUser:  lim("comment_user", rules.CommentUser),
		UploadUser:   lim("upload_user", rules.UploadUser),
		PasswordUser: lim("password_user", rules.PasswordUser),
		SaveUser:     lim("save_user", rules.SaveUser),
		ReportUser:   lim("report_user", rules.ReportUser),

		SellerWriteUser: lim("seller_write_user", rules.SellerWriteUser),
		ExportUser:      lim("export_user", rules.ExportUser),
	}
	proxies, err := middleware.ParsePrefixes(cfg.TrustedProxies)
	if err != nil {
		return err
	}
	// Background sweeps stop when sweepCtx is cancelled and are awaited before
	// the pool closes; an advisory lock lets only one API instance run each.
	sweepCtx, stopSweeps := context.WithCancel(ctx)
	defer stopSweeps()
	sweeps := &sweep.Runner{Locker: sweep.PGLocker{Pool: pool}, Observe: m.ObserveSweep, Logger: slog.Default()}
	pruneEvery, _ := cfg.TokenPruneEvery() // checked by cfg.Validate
	if pruneEvery > 0 {
		sweeps.Start(sweepCtx, pruneJob(st, pruneEvery))
	}
	cleanEvery, cleanAge, _ := cfg.MediaCleanup() // checked by cfg.Validate
	if media != nil && cleanEvery > 0 {
		sweeps.Start(sweepCtx, mediaJob(media, st, cleanEvery, mediaclean.Options{MinAge: cleanAge, MaxDeletes: maxMediaDeletes}))
	}

	// Complexity, depth, parser and cache limits live in graph.NewServer (#207).
	srv := graph.NewServer(resolver, cfg.AppEnv != "production")
	srv.Use(graph.ObserveOperations(m))
	// Internal errors and resolver panics are reported (the client only ever
	// sees "internal server error"); the wrappers keep the originals' behaviour.
	srv.SetErrorPresenter(func(ctx context.Context, err error) *gqlerror.Error {
		out := graph.ErrorPresenter(ctx, err)
		if out != nil && out.Extensions["code"] == graph.CodeInternal {
			ev := errreport.Event{Kind: "internal_error", Message: err.Error(), Method: http.MethodPost, Path: "/graphql",
				RequestID: chimiddleware.GetReqID(ctx)}
			if graphql.HasOperationContext(ctx) {
				ev.Operation = graphql.GetOperationContext(ctx).OperationName
			}
			reporter.Report(ev)
		}
		return out
	})
	srv.SetRecoverFunc(func(ctx context.Context, p any) error {
		m.Panic()
		reporter.Report(errreport.Event{Kind: "panic", Message: middleware.PanicText(p), Stack: string(debug.Stack()),
			Method: http.MethodPost, Path: "/graphql", RequestID: chimiddleware.GetReqID(ctx)})
		return graph.RecoverFunc(ctx, p)
	})

	checker := &health.Checker{
		Database: pool.Ping,
		Migrations: health.MigrationProbe(func(ctx context.Context, version string) (bool, error) {
			var ok bool
			err := pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&ok)
			return ok, err
		}, health.ExpectedMigration),
		Logger: slog.Default(),
	}
	if media != nil {
		checker.Storage = media.Ping
	}

	r := newRouter(routerDeps{
		Proxies:     proxies,
		Metrics:     m.HTTPMiddleware(),
		OnPanic:     m.Panic,
		Reporter:    reporter,
		CORSOrigins: cfg.CORSOrigins(),
		Ready:       checker.ReadyHandler(),
		GraphQL:     srv,
		GraphQLIP:   graph.IPRateLimit(lim("graphql_ip", rules.GraphQLIP)),
		Auth:        middleware.Auth(authSvc),
		Loaders:     graph.LoaderMiddleware(st),
		Playground:  cfg.AppEnv != "production",
	})

	httpSrv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("Moni Cafe API listening", "port", cfg.Port, "env", cfg.AppEnv)
		errCh <- httpSrv.ListenAndServe()
	}()

	// Metrics live on their own internal listener, which nginx never routes.
	var metricsSrv *http.Server
	if addr, _ := cfg.MetricsListen(); addr != "" { // checked by cfg.Validate
		mux := http.NewServeMux()
		mux.Handle("/metrics", m.Handler())
		metricsSrv = &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 15 * time.Second}
		go func() {
			slog.Info("metrics listening", "addr", addr)
			if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				slog.Error("metrics listener failed; the API keeps running without /metrics", "err", err)
			}
		}()
	}

	var serveErr error
	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			serveErr = err
		}
	case <-ctx.Done():
	}

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil && serveErr == nil {
		serveErr = err
	}
	if metricsSrv != nil {
		_ = metricsSrv.Shutdown(shutdownCtx)
	}
	// Stop the sweeps and wait for them: they use the pool, which closes next.
	stopSweeps()
	sweeps.Wait()
	return serveErr
}

// Advisory-lock keys, one per sweep ("moni" + 1, 2; scripts/migrate.sh uses
// the bare 1836019305).
const (
	lockKeyPrune = 1836019401
	lockKeyMedia = 1836019402
)

// pruneBatch bounds each DELETE so pruning never holds long locks.
const pruneBatch = 5000

// pruneJob deletes expired refresh tokens now and then every interval.
func pruneJob(st *store.Store, every time.Duration) sweep.Job {
	return sweep.Job{Name: "token_prune", Key: lockKeyPrune, Every: every, RunNow: true,
		Run: func(ctx context.Context) (int, error) {
			n, err := st.PruneRefreshTokens(ctx, pruneBatch)
			if err == nil && n > 0 {
				slog.Info("pruned expired refresh tokens", "rows", n)
			}
			return int(n), err
		}}
}

// maxMediaDeletes bounds one cleanup run; the rest waits for the next tick.
const maxMediaDeletes = 1000

// mediaJob deletes unreferenced images from the bucket every interval (first
// run one interval after start, so a restart loop never sweeps).
func mediaJob(media *storage.Media, st *store.Store, every time.Duration, opts mediaclean.Options) sweep.Job {
	return sweep.Job{Name: "media_cleanup", Key: lockKeyMedia, Every: every,
		Run: func(ctx context.Context) (int, error) {
			res, err := mediaclean.Sweep(ctx, media, st.ReferencedImageKeys, time.Now(), opts)
			if err == nil && res.Deleted > 0 {
				slog.Info("deleted orphaned images", "scanned", res.Scanned, "orphans", res.Orphans, "deleted", res.Deleted)
			}
			return res.Deleted, err
		}}
}
