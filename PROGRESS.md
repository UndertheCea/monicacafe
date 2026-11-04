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
- `graph/schema.resolvers.go` — all resolvers stubbed (panic "not implemented") — to be implemented in Iteration 3

---

## Iteration 3 — Read API, `/coffees` page, structured errors

**Completed (three slices)**

### Slice 1 (backend): all read queries wired to PostgreSQL

- `internal/store/` — raw `pgx` queries on `*pgxpool.Pool` (no sqlc yet). UUIDs are cast to
  `::text` at the SQL boundary; prices scan into `money.TWD`.
- `graph.Resolver` now holds `Store *store.Store`; `cmd/server` connects via `db.New(cfg.DatabaseURL)`.
- Implemented: `me`, `shop(slug)`, `shops(city, limit, offset)`, `shopsForMap`, `coffee(id)`,
  `coffees(filter, limit, offset)`, `popularCoffees`, `originCountries`, `coffeeVarieties`,
  `processingMethods`, plus field resolvers `Shop.coffees`, `Coffee.variants`, `Coffee.comments`,
  `Coffee.commentCount`, `User.shop`.
- `gqlgen.yml` gained field-resolver config for those nested fields; `Coffee.shop`,
  `originCountry`, `variety`, `processingMethod` are filled by JOIN in the parent query.
  Generated code was regenerated (`go run github.com/99designs/gqlgen@v0.17.73 generate`);
  **the schema is unchanged**.
- Filter semantics: all filters AND together; `flavorNote` is a case-insensitive substring match
  over `flavor_notes` (LIKE metacharacters escaped); `min/maxPriceTwd` must be satisfied by the
  *same available* variant. Pagination: default 20, max 100.
- Public listings show published coffees only. `coffee(id)` returns a draft only to the owning seller.
- `popularCoffees` = published coffees ranked by comment count, then newest.
- Unknown slug / id → `null` (nullable fields), malformed UUID → `BAD_USER_INPUT`.
- **Privacy:** comment authors are returned without email (`User.email` = `""`) — contact info
  must never be public.

### Slice 2 (frontend): `/coffees` listing with filter sidebar + bilingual shell

- `lib/i18n/dict.ts` — `t(locale, key, vars)` with a type-checked zh-TW/EN dictionary, `pick()`
  for bilingual DB fields; `lib/i18n/server.ts` reads the `locale` cookie (default zh-TW).
- `LanguageToggle` (client, sets cookie + `router.refresh()`), `SiteHeader`, `SiteFooter` in root
  layout; `<html lang>` follows the locale.
- `lib/graphql.ts` — typed documents (`typed<TData, TVars>()` + `query()`), `ApiError` /
  `toApiError()` reading the backend's `extensions.code/messageZh/messageEn`.
  Server components use `GRAPHQL_URL_INTERNAL` (compose: `http://backend:4000/graphql`).
- `/coffees` — server-rendered; GET-form sidebar (origin grouped by region, variety, process,
  roast radio, flavor search, NT$ price range), coffee cards (roast badge, origin/process/variety,
  flavor chips, "NT$X 起" from cheapest available variant), pagination (12/page), bilingual
  empty and error states. Works without JS; filters live in the URL.
- `formatPrice` (USD) replaced by `formatTWD` (whole NT$).

### Slice 3 (cross-cutting): structured GraphQL errors + tests + dev seed

- `internal/apperr` — bilingual `*apperr.Error` with codes `NOT_FOUND`, `UNAUTHENTICATED`,
  `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_IMPLEMENTED`, `INTERNAL`. `apperr.Presenter` (gqlgen error
  presenter) sets `message` = zh-TW and `extensions {code, messageZh, messageEn, field?}`; unknown
  errors become `INTERNAL` with the cause logged, never leaked. `apperr.Recover` turns resolver
  panics into `INTERNAL`.
- **No resolver panics any more.** Mutations not yet built return `NOT_IMPLEMENTED` with a comment
  naming the roadmap slice that will implement them.
- Tests: table-driven tests for the presenter, `Page`, `escapeLike`, `buildCoffeeWhere`; DB
  integration tests for every store method (run when `MONICA_TEST_DATABASE_URL` points at a
  migrated DB, skipped otherwise — verified this session against Postgres with 001 applied).
- `scripts/seed_dev.sql` — idempotent demo seller, shop (台北市 with lat/lng) and 3 published
  coffees with variants. Not in `migrations/` so it never auto-runs. Demo user cannot log in
  (placeholder hash) until auth lands.
- `frontend/public/` created (frontend Dockerfile copies it); compose passes `GRAPHQL_URL_INTERNAL`.

**Deferred / notes**

- Coffee cards don't link anywhere yet — the detail page doesn't exist. Add the link with the
  detail page. The API has `coffee(id)` but no `coffee(slug)`; the detail route will need to use
  the id (or the schema needs a slug lookup — a schema change, so decide deliberately).
- N+1: `variants`/`commentCount` are one query per coffee (≤ 12–100 per page). Add a dataloader if
  it shows up in profiling.
- `next lint` has no ESLint config yet (interactive prompt); `npm run build` type-checks.

**Next session should start with**

1. Auth mutations (`register`/`login`/`refreshToken`/`logout`, bcrypt) + `/login` `/register` pages.
2. Coffee detail page with variants and comments, then `addComment`/`deleteComment`.
3. Update `seed_dev.sql` with a real bcrypt hash once login works.

---

## Roadmap

### Stage 1 — Discovery (current focus)

**Backend (resolvers)**
- [ ] Auth mutations: `register`, `login`, `refreshToken`, `logout` (bcrypt + JWT)
- [x] `shops` + `shopsForMap` queries (read from DB)
- [x] `coffees` + `popularCoffees` queries with filter support
- [x] `shop(slug)` and `coffee(id)` single-item queries
- [x] `originCountries`, `coffeeVarieties`, `processingMethods` lookup queries
- [ ] Seller mutations: `createShop`, `updateShop`
- [ ] Coffee mutations: `createCoffee`, `updateCoffee`, `publishCoffee`, `unpublishCoffee`
- [ ] `addComment` + `deleteComment` mutations
- [x] `me` query (from JWT context)

**Frontend (pages + components)**
- [x] Bilingual layout shell: `t()` helper, language toggle (zh-TW ↔ EN), Navbar, Footer (minimal; nav grows as pages land)
- [ ] Home page: hero, featured coffees grid, top origins strip (still the old English-only hero)
- [x] Coffee listing page `/coffees` with filter sidebar (origin, variety, processing, roast)
- [ ] Coffee detail page `/coffees/[slug]` with variants, flavor notes, comments section
- [ ] Shop listing page `/shops` with city grouping
- [ ] Shop detail page `/shops/[slug]` with banner, logo, coffee grid
- [ ] Map page `/map` — Leaflet pins for all shops (use CDN Leaflet, not npm)
- [ ] Seller dashboard `/dashboard` — create/edit shop and coffees (auth-gated)
- [ ] Auth pages: `/login`, `/register`
- [x] GraphQL client: typed client wrapping the backend at port 4000 (graphql-request)

**Cross-cutting**
- [x] DB connection wired into resolvers (`Resolver` struct gets a pgx-backed `Store`)
- [x] Auth middleware wiring: `UserIDFromContext(ctx)` helper for resolver auth checks
- [x] Error handling: structured GraphQL errors (not raw `panic`)
- [ ] Dockerfile for backend (`cmd/server`) and frontend (exist; not yet verified with `docker build`)
- [ ] `.env.example` with all required env vars documented
- [x] Seed script: insert one demo shop + 3 demo coffees for local dev
- [ ] File upload: seller logo/banner/coffee images (S3-compatible)

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
