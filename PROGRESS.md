# Moni Cafe — Build Progress

## Product Vision

**Moni Cafe** is a Taiwan coffee marketplace — think Shopify's "Shop" app but for specialty coffee.
Each roaster / seller gets a storefront page where they upload photos and coffee descriptions
and get an auto-generated page. Monica Cafe is the community aggregation layer: buyers browse,
filter, and comment on coffees, then (Stage 2+) add to cart and checkout on the platform.

**Key decisions**
- Market: Taiwan coffee, B2C + small roasters (C2C). Ships within Taiwan only. No green beans.
- Currency: TWD (whole NT$, no decimals — stored as `INTEGER` / `money.TWD int64`)
- Brand: **MONI CAFE**
- Primary keys: UUID (`gen_random_uuid()`)
- Bilingual: Traditional Chinese (zh-TW) primary, English secondary
- Stage 1: Discovery + browsing only. No checkout.
- Stage 2+: Cart, ECPay (綠界) checkout, order management
- Sellers never expose personal contact info publicly
- Platform charges commission on each transaction (sellers cannot link out)

---

## Iteration 1 — Backend scaffold + GraphQL foundation

**Completed**

- Go 1.24 monorepo (`backend/`, `frontend/`, `migrations/`, `docker-compose.yml`)
- `cmd/server`: chi router, gqlgen GraphQL server, JWT auth middleware
- `cmd/worker`: River job queue skeleton (Stage 2)
- gqlgen v0.17.73 configured with custom `TWD` scalar
- JWT auth: HS256, 15-min access tokens, 7-day refresh tokens
- PostgreSQL (pgx v5), Redis, Docker Compose with healthchecks
- Nginx reverse proxy (frontend :3000, backend :4000)
- Next.js 15 App Router + React 19 + TypeScript strict + Tailwind CSS v4 frontend
- Home page with hero (stone-900 bg, amber accents) and feature grid

---

## Iteration 2 — Taiwan marketplace integration

**Completed**

### GraphQL schema rewrite (`backend/graph/schema.graphqls`)

Full Taiwan coffee marketplace schema:

| Type | Fields |
|------|--------|
| `User` | id, email, displayName, role (BUYER/SELLER/ADMIN), shop, createdAt |
| `Shop` | id, slug, name, description, logoUrl, bannerUrl, city, lat, lng, coffees |
| `ShopPin` | id, slug, name, city, lat, lng — lightweight type for the map page |
| `Coffee` | id, shop, name, slug, description, originCountry, variety, processingMethod, roastLevel, flavorNotes, imageUrls, variants, comments, commentCount, isPublished |
| `Variant` | id, grind, weightG, priceTwd (TWD scalar), stock, isAvailable |
| `OriginCountry` | id, nameEn, nameZh, region |
| `CoffeeVariety` | id, name, description |
| `ProcessingMethod` | id, nameEn, nameZh, description |
| `Comment` | id, user, body, createdAt — simple non-threaded (not Reddit-style) |

Queries: `me`, `shop`, `shops`, `shopsForMap`, `coffee`, `coffees`, `popularCoffees`,
`originCountries`, `coffeeVarieties`, `processingMethods`

Mutations: auth (register/login/refreshToken/logout), shop management, coffee listings
(create/update/publish/unpublish), comments (add/delete)

Enums: `UserRole`, `RoastLevel` (LIGHT/MEDIUM/MEDIUM_DARK/DARK),
`GrindOption` (WHOLE_BEAN/COARSE/MEDIUM/FINE/ESPRESSO)

Filters: `CoffeeFilter` — coffee-centric only (origin, variety, processing method, roast level,
flavor note, price range). **No location-based filter.**

Stage 2 mutations (cart, orders, ECPay) stubbed as a comment.

### Platform packages (`backend/internal/platform/`)

| Package | Purpose |
|---------|---------|
| `money` | `TWD int64` with `String()`, `Add()` (overflow-safe), `MarshalGQL` / `UnmarshalGQL` |
| `twfmt` | Taiwan validators: mobile (09xx), postal code (3/5/6-digit), CVS store ID, 統一編號 (tax ID mod-11) |
| `tz` | `Taipei = time.FixedZone("Asia/Taipei", 8*60*60)`, `ToTaipei()` helper |
| `config` | Unified `Config` struct loaded from env; defaults: PORT=4000, LOCALE=zh-TW, APP_ENV=development |

All packages have full unit test coverage — `go test ./...` passes (5 packages).

### ECPay payment stub (`backend/internal/payments/ecpay/`)

SHA256 `CheckMacValue` signing with .NET-compatible URL encoding. **Parked for Stage 3.**
Tests: round-trip and tamper-detection.

### Database migration (`migrations/001_initial.sql`)

Taiwan marketplace schema from scratch:

- Extensions: `pgcrypto` (UUID), `citext` (case-insensitive email)
- `users` — UUID PK, citext email unique, `user_role` enum
- `shops` — UUID PK, slug unique, lat/lng for map page
- `origin_countries` — 24 countries seeded (Africa / Americas / Asia-Pacific / Middle East)
- `coffee_varieties` — 23 varieties seeded (Geisha, Bourbon, SL28, SL34, Heirloom, Landrace, etc.)
- `processing_methods` — 12 methods seeded (Washed 水洗, Natural 日曬, Honey 蜜處理, Anaerobic 厭氧, etc.)
- `coffees` — UUID PK, `roast_level` enum, `flavor_notes TEXT[]`, `image_urls TEXT[]`
- `variants` — `price_twd INTEGER` (whole NT$), `grind_option` enum, stock
- `comments` — 1–500 char limit, non-threaded

Dropped: `producers` table, USD prices, Stripe references from previous scaffold.

### gqlgen codegen

- `gqlgen.yml` — `TWD` scalar mapped to `money.TWD`; `Time` scalar to `gqlgen/graphql.Time`
- `graph/generated/generated.go` and `graph/model/models_gen.go` regenerated from new schema
- `graph/schema.resolvers.go` — all resolvers stubbed (panic "not implemented") — implemented in Iteration 3

---

## Iteration 3 — Data layer, resolvers, auth

**Completed**

### Database (`migrations/002_auth_and_constraints.sql`)
- `refresh_tokens` table — stores only the SHA-256 of each refresh token's JTI; supports rotation + revocation
- `shops.owner_id` UNIQUE (one shop per seller); slug format CHECKs on `shops` and `coffees`
- GIN index on `coffees.flavor_notes`, partial index for published-newest listing, `(coffee_id, created_at)` on comments
- `set_updated_at()` trigger on users / shops / coffees
- Verified: both migrations apply cleanly on PostgreSQL 16

### Store layer (`backend/internal/store/`)
- Hand-written pgx v5 data-access layer (chose this over sqlc to avoid a codegen toolchain dependency; all SQL lives in this package)
- Sentinel errors `ErrNotFound` / `ErrConflict` / `ErrInvalidReference`; `ConstraintError` + `ViolatedConstraint()` to tell conflicts apart
- `InTx` transaction helper; batch queries (`UsersByIDs`, `ShopsByIDs`, `VariantsByCoffeeIDs`, `CommentCountsByCoffeeIDs`) for dataloaders
- Coffee filter builder: origin / variety / process / roast / flavor note (case-insensitive) / price range (matches in-stock, available variants only)

### Auth (`backend/internal/auth/`)
- bcrypt password hashing (8–72 bytes), timing equalisation for unknown emails
- JWT: issuer + expiry required, HS256 pinned, separate access/refresh secrets, refresh tokens carry a random JTI
- Refresh-token **rotation**; reuse of a consumed token revokes every session for that user; `logout` revokes all sessions
- `config.Validate()` refuses to start in production with default / short / identical JWT secrets

### GraphQL (`backend/graph/`)
- Hand-written models (`graph/model/models.go`) bound via gqlgen `autobind`; relationships resolved by field resolvers
- Request-scoped dataloaders (`vikstrous/dataloadgen`) for Coffee.shop, Coffee.variants, Coffee.commentCount, Comment.user — no N+1
- Curated reference data (origins / varieties / processing methods) cached in memory (5-min TTL)
- **All resolvers implemented** — no `panic("not implemented")` left:
  - Auth: `register`, `login`, `refreshToken`, `logout`, `me`
  - Shops: `shop`, `shops` (city filter, paging), `shopsForMap`, `createShop` (promotes BUYER → SELLER), `updateShop` (URL + lat/lng validation)
  - Coffees: `coffee`, `coffees` (filter + paging), `popularCoffees` (by comment count), `createCoffee` (auto ASCII slug + random suffix, variants in one tx), `updateCoffee`, `publishCoffee` (requires ≥1 variant), `unpublishCoffee`
  - Comments: `addComment` (published coffees only, 1–500 chars), `deleteComment` (author or admin)
- Authorisation: drafts visible only to the owning seller / admins; shop & coffee mutations owner-only
- **Privacy**: `User.email` is now nullable and only returned to the user themself or admins (comment authors' emails never leak)
- Typed client errors via `extensions.code`: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_USER_INPUT`, `CONFLICT`; unknown errors are logged and masked as `INTERNAL_SERVER_ERROR`
- Input validation: email, slugs, text lengths (rune-counted for 中文), flavor notes (≤10, dedupe), variants (≤10, ranges, no duplicate grind+weight)

### Server (`backend/cmd/server`)
- Wires pgx pool → store → resolver; JSON `slog` logging; graceful shutdown on SIGINT/SIGTERM
- Query complexity limit (500), 1 MiB request cap, HTTP timeouts, introspection disabled in production
- `/health` now pings the database

### Tooling
- gqlgen is now a Go 1.24 `tool` dependency: run `go tool gqlgen generate` (old `tools.go` removed)

### Tests
- Unit: auth (token round-trip, kind separation, expiry, wrong secret, passwords), config validation, graph helpers (slugify, paging, validation)
- Integration (`graph/integration_test.go`, runs when `TEST_DATABASE_URL` is set): full register → login → refresh-rotation/reuse → shop → coffee → publish → filter → comment → delete → unpublish → logout flow over HTTP
- `go build ./...`, `go vet ./...`, `go test -race ./...` all pass against PostgreSQL 16

---

## Iteration 4 — Coffee detail, shop pages, Docker demo ready

**Completed** (three slices, verified end to end with `docker compose up`)

### Slice 1 (frontend) — Coffee detail page `/coffees/[id]`
- Server component: image gallery (gradient + ☕ fallback), shop byline, facts grid (origin / variety / process / roast),
  flavor-note chips that link back to `/coffees?flavor=…`, description, variant table (grind, weight, NT$ price, stock / sold-out),
  "online checkout coming soon" notice (Stage 1 = no cart), "sold by" shop card
- Read-only `CommentList` (author display name + Taipei-local date); add-comment form waits for frontend auth
- `notFound()` + bilingual `not-found.tsx` → real HTTP 404 for bad / unknown / unpublished IDs (UUID checked client-side first)
- `react.cache` dedupes the fetch between `generateMetadata` and the page
- `CoffeeCard` is now a stretched link to the detail page (one tab stop, focus ring)

### Slice 2 (frontend) — Shops `/shops` and storefront `/shops/[slug]`
- Directory grid of `ShopCard`s (banner, logo, city, description) with pagination
- Storefront: banner + logo header, description, the shop's published coffees (reusing `CoffeeCard`), pagination, bilingual 404
- Header nav gains 店家 / Shops
- Shared components extracted: `Pagination` (base-path aware `pageHref`), `ErrorState`, `NotFoundState`
- ~40 new `t()` keys in both zh-TW and en (`coffee.*`, `grind.*`, `comments.*`, `shops.*`)

### Slice 3 (cross-cutting) — Docker demo readiness
- `docker-compose.yml`: every value overridable from `.env` with safe dev defaults; Postgres init via `scripts/initdb.sh`
  (applies `migrations/*.sql` in order, then `scripts/seed_dev.sql` unless `SEED_DEMO_DATA=false`); backend / frontend
  healthchecks; `depends_on: service_healthy` chain postgres+redis → backend → frontend → nginx; `restart: unless-stopped`
- `.env.example` listing every env var with safe defaults
- `backend/Dockerfile`: non-root user, `-trimpath`, healthcheck on `/health`; runtime stage needs no `apk` downloads
  (CA roots copied from the builder; `tz.Taipei` is a fixed zone so no tzdata)
- `frontend/Dockerfile`: fixed missing `public/` (build used to fail at `COPY /app/public`), `HOSTNAME=0.0.0.0`,
  non-root user, healthcheck, `NEXT_PUBLIC_GRAPHQL_URL` as a build arg; `.dockerignore` for both images
- Backend: `CORS_ORIGIN` is now a comma-separated list (`config.CORSOrigins()`, table-driven test); default allows
  `http://localhost` (nginx) and `http://localhost:3000` (`next dev`) — previously browser calls via nginx would be rejected
- Seed: 3 shops (台北 / 台中 / 台南, with lat/lng for the map), 6 coffees, 10 variants (one sold out), 1 comment; still idempotent
- **Security**: Next.js 15.3.1 → 15.3.9 (fixes critical RSC RCE CVE-2025-66478)
- `frontend/tsconfig.tsbuildinfo` untracked, `next-env.d.ts` git-ignored

### Verification
- `go build ./...`, `go vet ./...`, `go test ./... -count=1` pass; integration test passes against PostgreSQL 16
- `npm run build` passes (6 routes)
- `docker compose up --wait`: all 6 services healthy; via nginx on `http://localhost`: `/`, `/coffees`, `/coffees/<id>`,
  `/shops`, `/shops/<slug>`, `/health` → 200; unknown shop → 404; `/graphql` returns data with
  `Access-Control-Allow-Origin: http://localhost`; initdb logs show both migrations + seed applied
  (verified in the build sandbox with its proxy CA injected into a throwaway copy of the Dockerfiles — the committed
  Dockerfiles need no such step on a normal network)

### Decisions / deferred
- Not-found pages return HTTP 404 via `notFound()` rather than rendering inline
- `npm audit` still reports Next.js advisories whose fix is only in Next 16 (image optimizer, middleware, cache
  poisoning — mostly features we don't use yet). A Next 16 upgrade is its own task; `images.remotePatterns: "**"` should
  be tightened once uploads land (GHSA-9g9p-9gw9-jx7f)
- Home page (`/`) is still the English-only placeholder hero with a dead `/subscribe` link
- `/map` returns 404 — not built yet

---

## Iteration 5 — Map page, bilingual home page, CI

**Completed** (four slices: 2 frontend, 1 backend, 1 cross-cutting)

### Slice 1 (frontend) — `/map` page
- Leaflet 1.9.4 + OpenStreetMap tiles (attribution shown); Leaflet is imported lazily inside an effect so it never runs during SSR
- Amber `circleMarker` pins (no marker image assets to bundle), tooltip with the shop name, and a popup built with DOM
  APIs (`textContent`) so seller-supplied names cannot inject HTML; popup links to `/shops/[slug]`
- Map fits the bounds of all pins (falls back to a Taiwan-wide view); scroll-wheel zoom off so the page still scrolls
- Shop list beside the map: clicking a shop pans to its pin and opens the popup; each row also links to the storefront
- Bilingual empty / error / loading states; header nav gains 地圖 / Map
- Verified in Chromium: 4 pins, list → popup works, no page errors

### Slice 2 (frontend) — Bilingual home page `/`
- Replaced the English-only placeholder hero: zh-TW / en hero, CTAs to `/coffees` and `/map` (dead `/subscribe` link removed)
- 人氣咖啡 / Popular coffees strip (`popularCoffees(limit: 4)`, reuses `CoffeeCard`) and 最新加入的店家 / New shops strip
  (`shops(limit: 4)`, reuses `ShopCard`), each with a "see all" link
- Each strip fails independently (shows an inline notice) so one failed query doesn't blank the home page
- "Why MONI CAFE" features rewritten for the marketplace (roasted coffee only, readable flavor info, local shops)
- ~38 new `t()` keys (`map.*`, `home.*`) in both locales

### Slice 3 (backend) — `shopsForMap` returns only pinnable shops
- New `store.MapShops`: one SQL query returning only shops with both coordinates set and within the WGS84 range
  (replaces `AllShops`, which returned shops without a location)
- `store.Pinnable(lat, lng)` mirrors the SQL predicate; the resolver also applies it as defence in depth
- Table-driven `TestPinnable` (10 cases); integration test asserts a shop is absent from `shopsForMap` before it has
  coordinates and present afterwards, and that no returned pin has a null lat/lng

### Slice 4 (cross-cutting) — CI + lockfile
- `.github/workflows/ci.yml`: backend job (Postgres 17 service, applies migrations + demo seed, gofmt check,
  `go build` / `go vet` / `go test -race` incl. the integration test); frontend job (`npm ci --legacy-peer-deps`, same as
  the Dockerfile, `tsc --noEmit`, `npm run build`); `docker compose config` job
- `frontend/package-lock.json` was out of sync with `package.json` (`npm ci` failed on picomatch); regenerated while adding
  `leaflet` / `@types/leaflet`

### Verification
- `go build ./...`, `go vet ./...`, `go test ./... -count=1` pass; integration test passes against **PostgreSQL 17** with
  both migrations and `scripts/seed_dev.sql` applied cleanly
- `npm run build` passes (7 routes, `/map` new); `docker compose config --quiet` passes
- Backend + `next start` against the seeded DB: `/`, `/map`, `/coffees`, `/shops` → 200; checked in Chromium
- **Not re-verified this session:** a full `docker compose up` — Docker Hub returned 429 (rate limited) in the build
  sandbox. Nothing in the Dockerfiles / compose changed; the next session should run `docker compose up --wait` to tick
  the last demo checklist item

### Decisions / deferred
- OSM's public tile server is fine for the demo; a production deploy should use a tile provider with an SLA/API key
- `shopsForMap` now omits shops without a location (they still appear on `/shops`)
- `npm audit` still flags Next.js advisories fixed only in Next 16 (see iteration 4)

---

## Component Status

| Component | Status |
|-----------|--------|
| Repo scaffold & Docker Compose | Done — `docker compose up` verified (iteration 4) |
| CI (GitHub Actions) | Done (iteration 5) |
| PostgreSQL schema / migrations | Done (001, 002) |
| Go data layer (store) | Done |
| GraphQL API (Stage 1 queries + mutations) | Done |
| JWT auth (register / login / refresh / logout) | Done |
| Next.js frontend — home page | Done — bilingual, popular coffees + new shops (iteration 5) |
| Next.js frontend — catalog / shop / coffee pages | Done (iteration 4) |
| Frontend auth (login / register, token refresh) | Not started |
| Map page | Done — Leaflet + OSM (iteration 5) |
| Seller dashboard | Not started |
| File uploads (S3-compatible) | Not started |
| Cart / orders / ECPay | Not started (Stage 2) |
| Meilisearch | Not started (Stage 3) |

## Next Iteration Should Tackle

**Iteration 6**
1. Run `docker compose up --wait` and confirm `/`, `/coffees`, `/shops`, `/map` via nginx on `http://localhost` → tick the
   final Stage 1 demo checklist item
2. Frontend auth: login / register pages, token storage + refresh, then the add-comment form on `/coffees/[id]`
3. Seller dashboard: create shop (incl. picking a location for the map), add coffees, publish / unpublish
4. File uploads (S3-compatible) for logo / banner / coffee images; tighten `images.remotePatterns`
5. Consider Next 16 upgrade to clear the remaining `npm audit` advisories

---

## Roadmap

### Stage 1 — Discovery (current focus)

- [x] Implement database layer (hand-written pgx store)
- [x] Wire resolvers: `shops`, `shopsForMap`, `coffees`, `popularCoffees`, `originCountries`, etc.
- [x] Auth resolvers: register, login, refreshToken, logout (bcrypt + JWT, rotation)
- [x] Frontend: bilingual layout (zh-TW / EN toggle), shop listing page, coffee detail page
- [x] Frontend: map page (Leaflet.js or Mapbox) with shop pins
- [x] Frontend: coffee filters (origin country, variety, processing method, roast level)
- [~] Frontend: simple comment section on coffee pages (read-only list done; add form needs frontend auth)
- [ ] File upload: seller logo/banner/coffee images (S3-compatible, Stage 1)
- [ ] Seller dashboard: create shop, add coffees, manage listings
- [x] Bilingual home page (popular coffees + new shops)
- [x] CI: GitHub Actions (backend incl. integration test, frontend build, compose config)

**Docker demo readiness**
- [x] `backend/Dockerfile` (multi-stage, runs `cmd/server`)
- [x] `frontend/Dockerfile` (multi-stage, standalone `server.js`)
- [x] `.env.example` listing every required env var with safe defaults
- [x] `nginx/nginx.conf` routing `/graphql` → backend:4000, everything else → frontend:3000
- [x] `scripts/seed_dev.sql` loads cleanly (auto-applied by `scripts/initdb.sh`)
- [x] `docker compose up` starts all services without manual intervention
- [~] Home page, /coffees, /shops, and /map all render at localhost without errors (all four render via `next start`; full `docker compose up` re-check pending — Docker Hub rate-limited in iteration 5)

### Stage 2 — Transactions

- [ ] Cart (Redis or DB-backed)
- [ ] Order schema (migration 002)
- [ ] River job queue for async order processing
- [ ] ECPay (綠界) integration: AIO payment, CVS delivery
- [ ] Order status webhooks from ECPay

### Stage 3 — Growth

- [ ] Meilisearch full-text search
- [ ] Seller analytics dashboard
- [ ] Featured / curated coffee collections
- [ ] Email notifications (order confirmation, comment reply)
- [ ] Mobile-optimised experience

---

## Tech Stack Summary

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15, React 19, TypeScript strict, Tailwind CSS v4 |
| Backend | Go 1.24, chi v5, gqlgen v0.17.73, pgx v5 |
| Database | PostgreSQL 17, UUID PKs, plain SQL migrations |
| Cache | Redis 7 |
| Search | Meilisearch v1.14 (Stage 2) |
| Payments | ECPay 綠界 (Stage 3) |
| Auth | JWT HS256, 15-min access / 7-day refresh |
| Currency | TWD integer (`money.TWD int64`) |
| Locale | zh-TW primary, English secondary |
| Infra | Docker Compose, Nginx reverse proxy |
| Jobs | River (Stage 2) |
