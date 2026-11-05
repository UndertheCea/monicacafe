# Moni Cafe — Project Brief

The one file every build session reads first. It holds the **current** picture: goal, plan, architecture and
the reasons behind it. History lives in [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md) (newest first). Agents
rewrite sections 2–5 each session; keep this file under ~250 lines by moving detail to the log.

Last updated: 2026-11-05 (after Session 6 / PR #5)

---

## 1. Final target

**MONI CAFE** is a Taiwan specialty-coffee marketplace — a "Shop app" for roasters. Each seller gets an
auto-generated bilingual storefront; buyers browse, filter and discuss coffees, and later buy them on-platform.

| Stage | Goal | Done when |
|---|---|---|
| **1 — Discovery** (current) | Browse shops / coffees / map, accounts, comments, seller dashboard, image uploads | `docker compose up` gives a complete demo on `http://localhost`; sellers can manage everything from the UI including images |
| 2 — Transactions | Cart, orders, ECPay (綠界) payment + CVS pickup / home delivery, order status webhooks | A buyer can pay with ECPay sandbox and the seller sees the order |
| 3 — Growth | Meilisearch search, seller analytics, curated collections, email notifications | — |

Product rules that never change: Taiwan only, ships within Taiwan, no green beans; prices in whole NT$;
zh-TW first, English second; sellers never expose personal contact info and can't link out (the platform
takes a commission on each sale).

## 2. Status

| Area | State |
|---|---|
| DB schema + migrations 001–004 | Done |
| Go store (pgx) + GraphQL API for Stage 1 | Done — incl. variant add / update / delete |
| Auth (JWT + refresh rotation; BFF cookie flow in Next) | Done |
| Pages: home, /coffees (+filters), /coffees/[id] (+comments), /shops, /shops/[slug], /map | Done |
| /login, /register, account menu | Done |
| Seller dashboard: open shop, new coffee, options, publish / unpublish | Done |
| Seller dashboard: edit coffee text, edit shop profile (incl. map location) | **Todo** |
| Image uploads (logo, banner, coffee photos) | **Todo** |
| Draft preview on public pages (needs server-side session) | **Todo** |
| CI (build / vet / race tests on Postgres 17, tsc, npm test, build, compose config) | Done |
| Branch cleanup workflow (deletes merged PR branches) | Done |
| Full `docker compose up` verified on a real Docker daemon | Last verified session 4; re-check |

## 3. Last session (Session 6 · PR #5)

Frontend auth (login / register, httpOnly refresh cookie via `/api/auth/*` route handlers, cross-tab refresh
lock), add / delete comments, seller dashboard (open shop, coffee list incl. drafts, publish / unpublish), coffee
editor (new coffee + options), backend variant mutations + migration 004 (unique grind + weight per coffee).
Not tested there: full `docker compose up`, nginx in front of the auth route handlers.

## 4. Next slices (in priority order — take from the top)

| # | Slice | Area | Notes |
|---|---|---|---|
| 1 | Edit coffee details on `/dashboard/coffees/[id]` (name, description, origin, process, variety, roast, flavor notes) | frontend | `updateCoffee` already exists |
| 2 | Shop profile page `/dashboard/shop` (name, description, city, lat / lng picker) | frontend | `updateShop` exists; lat / lng puts the shop on `/map` |
| 3 | Upload API: presigned PUT URLs for an S3-compatible store; validate type / size; save URLs on shop / coffee | backend | Needs decision Q1; schema addition allowed |
| 4 | MinIO service in docker compose + bucket bootstrap + `.env.example` entries | cross-cutting | Pairs with #3 |
| 5 | Image uploader component (logo, banner, coffee gallery) | frontend | After #3–4 |
| 6 | Tighten `images.remotePatterns` to the storage host; add a CSP (`img-src` must also allow the map tile host) | cross-cutting | After #4 |
| 7 | Server-side session so RSC fetches forward the access token → owners can preview drafts | frontend + backend | Decision Q2 |
| 8 | Verify `docker compose up --build` + `scripts/smoke.sh` through nginx on a real Docker daemon | cross-cutting | Fix whatever breaks |
| 9 | Stage 2 kickoff: cart schema (migration) + cart resolvers | backend | Only after Stage 1 is done; decision Q3 |

## 5. Open questions for the owner

Answer by writing on the **Answer** line. Until a question is answered, agents use the **default** only
where it is marked safe; otherwise they skip the slices that depend on it.

- **Q1. Image storage.** Options: (a) MinIO in compose for dev + any S3-compatible store in prod (Cloudflare
  R2, AWS S3, GCS); (b) local disk volume served by nginx; (c) a hosted image service (Cloudinary, imgix).
  Default (safe): (a) — same code path in dev and prod, no vendor lock-in. **Answer:**
- **Q2. Draft previews.** Options: (a) forward the access token to server-rendered fetches via a short-lived
  httpOnly cookie; (b) keep drafts dashboard-only and add a client-rendered preview there.
  Default (safe): (b) — no new credential surface. **Answer:**
- **Q3. Cart storage (Stage 2).** Options: (a) Postgres tables (durable, survives logout, one source of truth);
  (b) Redis (fast, but carts can vanish). Default: (a). Not safe to start without an answer. **Answer:**
- **Q4. Production map tiles.** OSM's public tile server isn't meant for production traffic. Options: (a) a tile
  provider (MapTiler, Stadia, Thunderforest — free tiers exist); (b) self-hosted tiles. Default: keep OSM for the
  demo, decide before launch. **Answer:**
- **Q5. Next.js 16 upgrade.** `npm audit` still shows 2 high (sharp / libvips) + 7 moderate advisories, none
  critical. Options: (a) upgrade to Next 16 now (breaking changes, one dedicated session); (b) wait until
  Stage 1 is done. Default (safe): (b). **Answer:**
- **Q6. Commission + payouts (Stage 2).** Rate, who pays ECPay fees, payout schedule. Business decision; no
  default. **Answer:**

## 6. Architecture

```
browser ──► nginx :80 ──┬─► frontend (Next.js 15, :3000) ──► backend /graphql (server components fetch directly)
                        │        └─ /api/auth/* route handlers (hold the refresh token in an httpOnly cookie)
                        └─► backend (Go, :4000) /graphql, /health
backend ──► PostgreSQL 17 (all data) · Redis 7 (reserved: cart / cache) · Meilisearch (Stage 3, idle)
```

| Path | What lives there |
|---|---|
| `backend/cmd/server` | HTTP server: chi, gqlgen, JWT middleware, slog, graceful shutdown |
| `backend/cmd/worker` | River job-queue skeleton (Stage 2) |
| `backend/graph/` | `schema.graphqls`, resolvers, hand-written models, dataloaders, input validation, integration tests |
| `backend/internal/store` | All SQL (hand-written pgx v5), transactions, sentinel errors |
| `backend/internal/auth` | bcrypt, JWT issue / verify, refresh rotation + reuse detection |
| `backend/internal/platform` | `money.TWD`, `twfmt` (Taiwan validators), `tz.Taipei`, `config.Load()` |
| `backend/internal/payments/ecpay` | ECPay CheckMacValue signing stub (Stage 2) |
| `migrations/NNN_*.sql` | Plain SQL, applied in order by `scripts/initdb.sh` (then `scripts/seed_dev.sql`) |
| `frontend/app/` | App Router pages; `api/auth/[action]` is the auth backend-for-frontend |
| `frontend/lib/` | `api.ts` (typed queries), `graphql.ts` (client), `i18n/dict.ts` (`t()`), `auth/`, `dashboard/` |
| `frontend/tests/*.test.mjs` | `npm test` (Node's built-in runner) |
| `scripts/smoke.sh` | Hits every demo route + GraphQL after `docker compose up` |
| `.github/workflows/` | `ci.yml` (all checks), `branch-cleanup.yml` (deletes merged PR branches) |

## 7. Why it looks like this

- **Hand-written pgx store, no sqlc / ORM** — no codegen toolchain; every query is visible in one package.
- **gqlgen with hand-written models + dataloaders** — relationships resolve lazily without N+1 queries.
- **Refresh token in an httpOnly cookie behind Next route handlers** — XSS can't steal a 7-day credential; the
  access token lives only in memory. Refreshes are serialised across tabs because reusing a rotated refresh
  token revokes every session (theft detection).
- **Server components fetch anonymously** — simple caching and no token on the server; the cost is that draft
  pages 404 publicly (Q2).
- **Prices as integer NT$** — TWD has no minor unit in practice; integers avoid rounding bugs.
- **UUID keys** — safe to expose in URLs, no enumeration.
- **Bilingual `t()` dictionary instead of an i18n library** — two locales, TypeScript enforces key parity, a test
  checks placeholders.
- **Leaflet + OSM** — no API key for the demo (see Q4 for production).
- **Coordinates validated in three places** (GraphQL input, `toShopPin`, DB CHECK in migration 003) — defence in
  depth because seeds and future admin tools write the table directly.

## 8. Rules for every change

1. No stubs: a resolver works or carries a comment explaining why it's deferred.
2. Prices are `INTEGER` NT$ in Postgres and `money.TWD` (int64) in Go; no float math on prices.
3. Every user-facing string goes through `t()` with zh-TW and English.
4. UUID primary keys (`gen_random_uuid()`); never serial.
5. Stage 1: no cart / payment / order code. Payments are ECPay only, never Stripe; no USD.
6. Config comes from env via `config.Load()`; never hardcode secrets or ports.
7. Schema changes are allowed when a slice needs them; regenerate with `go tool gqlgen generate`.
8. New Go logic gets a table-driven test; new frontend logic gets a pure helper + `npm test` case.
9. No location-based coffee filters; no green beans.

## 9. How to verify

```bash
cd backend && gofmt -l . && go build ./... && go vet ./... && go test ./... -count=1
# with a migrated DB: TEST_DATABASE_URL=postgres://monica:monica_secret@localhost:5432/monicacafe go test -race ./...
cd frontend && npm ci && npx tsc --noEmit && npm test && npm run build
docker compose config --quiet
# full stack: docker compose up --build -d && ./scripts/smoke.sh
```
