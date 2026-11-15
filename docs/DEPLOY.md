# Deploying Moni Cafe

Hosting is not settled yet (see `PROJECT_BRIEF.md`, question #199); this file collects the operational notes that
hold on any host. For now it covers the pre-exposure checklist and monitoring.

## Before you expose it

`docker compose up` is a development stack. Out of the box it publishes nginx on `127.0.0.1` only (`HTTP_BIND`), with
published JWT secrets, demo data and plain HTTP. A full production compose file and HTTPS are tracked in #219; until
then, work through this list before anything listens on a public address.

1. **Terminate TLS in front of nginx.** nginx here speaks plain HTTP on port 80. Put a TLS terminator / load balancer
   (Caddy, a cloud LB, Cloudflare) in front and point it at nginx. Then set `HTTP_BIND` to the address that proxy
   reaches (`0.0.0.0` only if nothing else on the host's public interface can reach port 80 directly; a firewall or a
   private network is better).
2. **Tell nginx who the proxy is.** Set `REAL_IP_FROM` to the proxy's IP or CIDR (one value; the default `127.0.0.1`
   trusts nothing real). nginx then takes the visitor's address from `X-Forwarded-For`, so its `limit_req` buckets,
   `X-Real-IP` and logs are per visitor instead of one bucket for the proxy. The proxy must set `X-Forwarded-For`
   itself and drop any value the client sent. Several proxies: edit `nginx/real-ip.conf.template` and add one
   `set_real_ip_from` line each.
3. **Set `APP_ENV=production`.** This turns GraphQL introspection and `/playground` off and enables the checks below. The
   API (and worker) refuse to start with a message naming the first setting that is wrong:
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: at least 32 characters, different from each other, not published.
   - `POSTGRES_PASSWORD` (checked inside `DATABASE_URL`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `MEILI_KEY`: not the values
     printed in `.env.example` (or containing `dev-` / `change`). Empty S3 / Meilisearch keys mean "not used".
   - `CORS_ORIGIN`: set, every origin `https://` and not localhost.
   - `SITE_URL`: set, `https://`, not localhost. (An `http://` value leaves the refresh cookie without `Secure`.)
   - `TRUSTED_PROXIES`: set explicitly. Empty, the API's built-in default (every private range) and `0.0.0.0/0` are
     refused. The compose default (loopback plus `COMPOSE_SUBNET`, i.e. nginx and the Next server) is right for the
     compose stack; do not add the TLS proxy there, nginx has already resolved the client address (step 2).
   - `SEED_DEMO_DATA=false` and `BACKUP_ALLOW_PLAINTEXT=false` (set `BACKUP_AGE_RECIPIENT`, see `docs/BACKUP.md`).
4. **Change `POSTGRES_PASSWORD` before the first start.** Postgres only reads it when the volume is created; changing
   it later needs `ALTER USER` as well.
5. **Keep the other ports private.** The API (`BACKEND_PORT`), Next server (`FRONTEND_PORT`) and Postgres are bound to
   `127.0.0.1`, and `/metrics` is on the internal port only. Don't change those binds, and firewall everything except
   the proxy's port.
6. **Grant the first admin** with `docker compose exec backend /app/admin grant <email>` and check the nightly backup
   (`--profile prod`) restores (`docs/BACKUP.md`).
7. **Background jobs (optional).** `docker compose --profile worker up -d` also starts the River worker (same image and
   environment as the API; healthy when the database answers). Off by default.

## Monitoring

Goal: when the site is slow or broken, someone finds out from an alert, not from a seller.

### What the stack exposes

| Endpoint | Where | Meaning |
|---|---|---|
| `GET /health/live` | API, and through nginx | The process serves requests. No dependencies. Use it to decide whether to restart. |
| `GET /health/ready` | API, and through nginx | Postgres answers **and** `schema_migrations` records the migration this build expects (`health.ExpectedMigration`). The object store is listed in the body (`ok` / `fail` / `disabled`) but never fails readiness: uploads break, browsing does not. Returns 503 when not ready. |
| `GET /health` | API, and through nginx | Alias of `/health/ready`. |
| `GET /api/health` | Next server, through nginx | `{"status","build","api"}`: the frontend build id and whether the API's `/health/ready` answered within 1.5 s. 503 when the API did not. |
| `GET /metrics` | API, **internal port only** (`METRICS_ADDR`, `:9100` in compose) | Prometheus text format. Never routed by nginx and not published to the host: scrape it from inside the compose network (or a private network on your host), and keep that port closed in the firewall. |

The health bodies name checks only, never error text; the reason is in the API log (`readiness check failed`).

`ExpectedMigration` is a constant in `backend/internal/health/health.go`, bumped in the same commit that adds a
`migrations/NNN_*.sql` file; a Go test fails when the newest migration file and the constant differ. Readiness asks
whether *that* migration is recorded (not whether it is the newest), so during a rolling deploy an old API instance
stays ready against a database that is already one migration ahead.

### Metrics worth knowing

| Metric | Labels | Use |
|---|---|---|
| `moni_graphql_operation_duration_seconds` (`_count`, `_bucket`) | `operation`, `status` = `ok` / `client_error` / `server_error` | Request count and latency per GraphQL operation. `server_error` = an `INTERNAL_SERVER_ERROR` in the response (GraphQL answers HTTP 200 even then). Operation names are limited to short identifiers; the first 100 distinct names are kept, anything else is `other`, no name is `anonymous`. |
| `moni_http_requests_total` | `route` (`graphql`, `health`, `playground`, `other`), `status` | HTTP status mix, including 429 and 5xx. |
| `moni_http_request_duration_seconds` | `route` | Latency per route. |
| `moni_db_pool_*` | | Connections max / total / idle / in use, acquires, **empty acquires** (waited for a connection), cancelled acquires. |
| `moni_rate_limit_rejections_total` | `bucket` (`login_ip`, `comment_user`, ...) | Who is being throttled. |
| `moni_sweep_runs_total`, `moni_sweep_deleted_total` | `job` (`token_prune`, `media_cleanup`), `outcome` (`ok`, `error`, `skipped`) | Background sweeps. `skipped` = another instance held the advisory lock. |
| `moni_panics_total` | | Recovered panics. |

No Prometheus or Grafana containers ship with the repo. Use your host's agent or a hosted Prometheus-compatible
service (many have a free tier) and point it at the internal `:9100/metrics`.

### The three alerts worth having

1. **Not ready for 2 minutes.** `/health/ready` fails (HTTP 503 or no answer) for 2 consecutive minutes. This
   catches a down database, a failed or forgotten migration, and a crashed API. Page someone.
2. **5xx rate above 2 % for 5 minutes.** GraphQL answers HTTP 200 even when a resolver fails, so count both
   failed operations and real HTTP 5xx on `/graphql` (a panic outside a resolver, a proxy error) against all
   `/graphql` requests:
   ```
   (
     sum(rate(moni_graphql_operation_duration_seconds_count{status="server_error"}[5m]))
     + sum(rate(moni_http_requests_total{route="graphql", status=~"5.."}[5m]))
   )
   / sum(rate(moni_http_requests_total{route="graphql"}[5m]))
   > 0.02
   ```
3. **Backup job failed.** The nightly backup (#220) reports to a dead-man's-switch style check: set
   `BACKUP_PING_URL` (for example a healthchecks.io URL with a 1-day period; `backup.sh` pings it on success and
   `$BACKUP_PING_URL/fail` on failure, #289) and alert on "no ping in 26 hours". An alert on a missing success is the
   only kind that also catches a job that never ran. The compose `backup` service is also `unhealthy` when its newest
   success is older than 26 hours (`docker compose ps backup`). Setup: [BACKUP.md](BACKUP.md#knowing-it-failed).

### Free external uptime check

Add a monitor from outside your network, so a dead host or an expired certificate is noticed too:

- Service: any free uptime monitor (UptimeRobot, Better Stack, healthchecks.io, ...), HTTP(S), every 1 to 5 minutes.
- URL: `https://<your domain>/health/ready`, expecting HTTP 200 (the body contains `"status":"ok"`).
- Optionally a second monitor on `https://<your domain>/api/health` (the frontend, and the API as the frontend sees it).
- Send alerts to email or a chat webhook that more than one person reads.

### Error reporting

Set `SENTRY_DSN` (Sentry, or a compatible self-hosted server such as GlitchTip) to report:

- the API: recovered panics and internal GraphQL errors (what the client sees only as "internal server error");
- the Next.js server: errors thrown while rendering on the server (`instrumentation.ts`, `onRequestError`).

Unset, reporting is a no-op. Events carry the error text, a stack, the HTTP method, the path without its query
string, the GraphQL operation name and the request id, and nothing else: no user, IP, headers, cookies or request
bodies, and emails, tokens, JWTs and database URLs are scrubbed from the text. Reporting is server-side only, so
the browser never sees the DSN and the Content-Security-Policy is unchanged; errors that happen only in the
browser are not reported (the error page shows the visitor a reference digest). `SENTRY_RELEASE` (for example the
git SHA) tags events with the build.

### Several API instances

The token-prune and orphaned-image sweeps take a Postgres advisory lock before each run, so with more than one API
instance only one runs a given sweep at a time. On shutdown the API stops the sweeps and waits for them before it
closes the database pool. Rate limits are still per instance (in memory).

## Upgrading Postgres to a new major (manual, #317)

Dependabot never proposes a new major of `postgres`, `redis` or `getmeili/meilisearch`: a new Postgres major can't
start on the old data directory, and CI (which starts from an empty volume) wouldn't notice. To upgrade:

1. Take a fresh backup and check it restores (`docs/BACKUP.md`, the drill steps).
2. In one change, bump both `postgres:` images in `docker-compose.yml`, the CI service image in
   `.github/workflows/ci.yml` and `postgresqlNN-client` in `scripts/backup.Dockerfile` (`pg_dump` refuses a newer server).
3. Stop the stack, keep the old volume (rename it, don't delete it), start `postgres` on a new empty volume with
   `SEED_DEMO_DATA=false`, then restore the backup with `scripts/restore.sh` and start the rest.
4. Delete the old volume only after a few days of normal running.

## Stripping metadata from existing images (one-off, before launch)

Since #285 the browser removes EXIF / XMP / GPS before every upload (`frontend/lib/dashboard/stripMetadata.ts`).
Images uploaded before that may still carry a seller's GPS position and phone model. Strip them once, before launch.
The API never sees image bytes, so this runs against the bucket with any S3 client and `exiftool`
(<https://exiftool.org>). Take a backup of the bucket first.

```bash
# 1. Mirror the bucket (use the S3_* values from .env; in dev S3_ENDPOINT is http://localhost)
export AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY AWS_DEFAULT_REGION=$S3_REGION
mkdir media-mirror && aws s3 sync "s3://$S3_BUCKET" media-mirror --endpoint-url "$S3_ENDPOINT"

# 2. See what is there (any GPS* line is a leak), then strip every tag in place.
#    -all= removes everything; -tagsfromfile @ -Orientation:all keeps the rotation so photos stay upright;
#    -overwrite_original keeps the file name, so the stored URLs stay valid.
exiftool -r -ext jpg -ext jpeg -ext png -ext webp -if '$GPSLatitude' -p '$Directory/$FileName' media-mirror
exiftool -r -ext jpg -ext jpeg -ext png -ext webp -overwrite_original \
  -all= -tagsfromfile @ -Orientation media-mirror

# 3. Check nothing is left, then upload back with the same content types.
exiftool -r -ext jpg -ext jpeg -ext png -ext webp -if '$GPSLatitude or $Make or $Model or $XMP:all' -p '$Directory/$FileName' media-mirror
aws s3 sync media-mirror "s3://$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
```

Step 3's check should print nothing. The stripped files have a newer modified time, so `sync` re-uploads them
(content types come from the extension). Thumbnails (`*.thumb.webp`) are made by a canvas and carry no metadata, but
the same commands cover them. Delete the local mirror afterwards: it holds the originals' copies.
