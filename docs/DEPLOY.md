# Deploying Moni Cafe

Hosting is not settled yet (see `PROJECT_BRIEF.md`, question #199); this file collects the operational notes that
hold on any host. For now it covers monitoring.

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
3. **Backup job failed.** The nightly backup (#220) must report success or failure to a dead-man's-switch style
   check (for example a healthchecks.io URL pinged at the end of the job: "no ping in 26 hours" alerts). An alert on
   a missing success is the only kind that also catches a job that never ran.

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
