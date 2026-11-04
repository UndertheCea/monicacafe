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

## Roadmap

### Stage 1 — Discovery (current focus)

- [ ] Implement database layer with sqlc (query files + generated code)
- [ ] Wire resolvers: `shops`, `shopsForMap`, `coffees`, `popularCoffees`, `originCountries`, etc.
- [ ] Auth resolvers: register, login, refreshToken (bcrypt + JWT)
- [ ] Frontend: bilingual layout (zh-TW / EN toggle), shop listing page, coffee detail page
- [ ] Frontend: map page (Leaflet.js or Mapbox) with shop pins
- [ ] Frontend: coffee filters (origin country, variety, processing method, roast level)
- [ ] Frontend: simple comment section on coffee pages
- [ ] File upload: seller logo/banner/coffee images (S3-compatible, Stage 1)
- [ ] Seller dashboard: create shop, add coffees, manage listings

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
