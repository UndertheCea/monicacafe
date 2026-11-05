# Moni Cafe — Session Log

The full history of every build session, **newest first**. This file is append-only history; the current
state of the project, the plan and the reasoning live in [`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md).

Agents: you don't need to read this file to start work. Read it only when you need the details of a past
session (e.g. why something was built a certain way). Add your own session at the top, under this paragraph,
using the template below.

<!--
## Session N — YYYY-MM-DD — <one-line theme>
PR: #<number>
### Shipped (one line per slice: area — what — key files)
### Verification (what ran and passed; what was NOT tested and why)
### Decisions / deferred (anything the next session or the owner should know)
-->

## Maintenance — 2026-11-05 — Split PROGRESS.md into brief + log

- `PROGRESS.md` (467 lines and growing) replaced by `PROJECT_BRIEF.md` (current state, plan, open questions,
  architecture, rationale — rewritten each session, kept short) and this log (full history, newest first).
  Iteration sections moved here unchanged.

---

## Iteration 6 — Frontend auth, comments, seller dashboard

**Completed** (six slices, one commit each)

### Slice 1 (backend) — Variant management mutations
- Schema: `addVariant(coffeeId, input: VariantInput!)`, `updateVariant(id, input: UpdateVariantInput!)`
  (price / stock / isAvailable, all optional, at least one required), `deleteVariant(id)`. Grind + weight are
  fixed once created (delete and re-add to change them)
- Store: `VariantByID`, `LockCoffee` (`SELECT … FOR UPDATE`), `AddVariant`, `UpdateVariant`, `DeleteVariant`
- Rules: owner/admin only; max 10 variants; duplicate grind+weight → `CONFLICT`; the last variant of a
  **published** coffee can't be deleted (`BAD_USER_INPUT`). `publishCoffee` now takes the same row lock, so
  publish and delete can't race into "published with no variants"
- **Migration 004**: unique index `(coffee_id, grind, weight_g)` on `variants` (replaces the single-column index;
  dedupes any old rows first)
- Table-driven tests: `TestValidateVariant`, `TestValidateVariantUpdate`

### Slice 2 (cross-cutting) — Variant test coverage
- `graph/variants_integration_test.go`: auth checks, conflict, partial updates, last-variant guard, a
  **concurrent `deleteVariant` race** (exactly one of two wins), 10-variant cap. Passed 3× with `-race`
- `internal/store/variants_test.go`: CRUD + the migration-004 index (`ViolatedConstraint` name), rolled back

### Slice 3 (frontend) — Auth: login / register, token refresh, account menu
- Backend-for-frontend route handlers `POST /api/auth/{login,register,refresh,logout}`: the refresh token sits in
  an **httpOnly, SameSite=Lax cookie scoped to `/api/auth`** (Secure behind https); page JS never sees it.
  Cross-origin `Origin` headers → 403. Logout calls the backend `logout` (revokes every session) and clears the cookie
- `AuthProvider` (root layout): access token in memory only; refresh 1 min before the 15-min expiry; one refresh
  at a time per tab and **serialised across tabs with the Web Locks API** (the backend revokes every session when
  a rotated refresh token is reused, so two tabs refreshing with the same cookie would log the user out);
  `request()` retries once after refreshing on `UNAUTHENTICATED`; login/logout synced across tabs (`BroadcastChannel`)
- `/login`, `/register` (safe `?next=` redirects — same-origin paths only), header `AccountMenu`
- Pure helpers `lib/auth/token.ts` + `tests/auth.test.mjs`

### Slice 4 (frontend) — Comments: add / delete on `/coffees/[id]`
- `CommentForm` for signed-in users (rune-counted 500-char limit like the backend, live counter); anonymous
  visitors get a login link back to the coffee. `DeleteCommentButton` only for the author or admins
- `COFFEE` query now fetches `user { id }` for each comment

### Slice 5 (frontend) — Seller dashboard `/dashboard`
- Signed out → login prompt; no shop → `CreateShopForm` (slug suggested from the name, validated like the backend,
  taken slug → bilingual message); otherwise shop header + every coffee **including drafts** with status badge,
  option count, from-price, comment count, publish / unpublish
- After `createShop` the session is reloaded so the token carries the SELLER role and the header shows 賣家後台
- Pure helpers `lib/dashboard/validate.ts` + `tests/dashboard.test.mjs`

### Slice 6 (frontend) — Coffee editor
- `/dashboard/coffees/new`: name, origin / process / variety / roast from the curated lists, flavor notes
  (`,` `，` `、` separated), description, 1–10 option rows (whole-NT$ prices — decimals rejected); saves a draft
- `/dashboard/coffees/[id]`: edit price / stock / on-sale per option, delete options, add options — all via the
  slice-1 mutations. `isAvailable` is only sent when the seller toggles it (the API reports `false` for any
  out-of-stock row, so the stored flag isn't visible)

### Also
- `scripts/smoke.sh` now checks `/login`, `/register`, `/dashboard`, `/dashboard/coffees/new` and that
  `POST /api/auth/refresh` without a cookie returns 401
- ~150 new `t()` keys (zh-TW + en); i18n parity tests still pass

### Verification
- Backend: `gofmt`, `go build`, `go vet`, `go test -race ./...` pass, with `TEST_DATABASE_URL` against
  PostgreSQL 16 (migrations 001–004 + seed; also applied to a fresh DB)
- Frontend: `npm ci`, `tsc --noEmit`, `npm test` (18 tests), `npm run build` (13 routes) pass
- `docker compose config --quiet` passes; `scripts/smoke.sh` passes against `next start` + the Go server
- Playwright against `next start` + Go server: register (client + server validation), session survives reload,
  two tabs refreshing at once stay signed in, logout propagates to the other tab, wrong password message,
  cross-origin refresh → 403; comment add / counter / too-long / delete; open shop (bad slug message) → new coffee
  (decimal price and duplicate row rejected) → publish → edit price → add option (duplicate rejected) → delete down
  to the last option (refused while published) → public page shows the option; a second user can't manage the
  coffee; no horizontal scroll at 390px, no page errors
- **Not tested:** full `docker compose up` (no Docker daemon in this sandbox) and nginx in front of the auth
  route handlers; behaviour without the Web Locks API (older Safari falls back to per-tab single-flight only)

### Decisions / deferred
- BFF cookie flow instead of storing refresh tokens in `localStorage` (XSS can't steal a 7-day credential)
- Server components still fetch anonymously, so a seller's **draft** coffee pages 404 at `/coffees/[id]`;
  sellers manage drafts from the dashboard. A server-side session (forwarding the access token to RSC fetches)
  would fix this — deferred
- Coffee **text** fields (name, description, notes) can't be edited from the UI yet — `updateCoffee` exists
- The backend's role claim is in the access token; after `createShop` we refresh to pick up SELLER

---

## Repo maintenance — branch cleanup + leftover tests

After PR #3, five unmerged `claude/focused-mendel-*` branches remained from runs that duplicated iteration 5.
Every feature on them is in master; the only code not yet ported was tests, now added:
- `backend/internal/store/shops_test.go` (from `-8b57gy`, adapted): DB-backed `TestShopPins` (raw coordinates
  round-trip for every shop) and `TestShopCoordinateConstraints` (migration 003 rejects out-of-range and NaN).
  Both run inside a rolled-back transaction and skip without `TEST_DATABASE_URL`
- `frontend/tests/i18n.test.mjs` (from `-h73xwl`): key parity, no empty strings, matching `{placeholders}` across
  zh-TW / en, `t()` / `pick()` cases. Run with `npm test` (Node's built-in runner); added to CI
- Not ported, by design: alternative pin helpers (`lib/map.ts`, `lib/mapPins.ts`) and `MapExplorer` (a map variant
  where clicking the list pans the map) — they duplicate master's `/map` implementation

New `.github/workflows/branch-cleanup.yml`:
- On every merged PR, deletes the head branch (skips if new commits were pushed after the merge, or the branch is
  the base of an open PR; never the default branch)
- Manual run (Actions → Branch cleanup): empty input deletes every branch fully merged into master; listed branches
  are deleted too, and any with commits not in master are first kept as tag `archive/<branch>`
  (restore with `git push origin archive/<branch>:refs/heads/<branch>`)

Scheduled runs now work on a branch, open a PR and merge it at the end of each session (see the routine prompt).

---

## Iteration 5 — Map page, bilingual home, smoke test (Stage 1 demo checklist complete)

**Completed** (three slices)

### Slice 1 (backend) — Lean `shopsForMap`
- New `store.ShopPins` query reads only `id, slug, name, city, lat, lng` (ordered by city, name) instead of every
  shop column; `AllShops` removed (it had no other callers)
- `toShopPin` exposes a coordinate pair only when both halves are present and in range, so the map never gets
  half a location; table-driven `TestToShopPin` (7 cases)
- Integration test now asserts the seller's shop appears in `shopsForMap` with its exact lat/lng

### Slice 2 (frontend) — `/map` page
- Leaflet 1.9.4 + OpenStreetMap tiles (no API key), loaded client-side inside `useEffect` (`components/map/ShopMap.tsx`)
- ☕ `divIcon` markers (no Leaflet image assets needed), fit-to-bounds, popups link to `/shops/[slug]`;
  popups use DOM nodes + `textContent` because shop names come from sellers (no HTML injection)
- Loading / failed overlay; scroll-wheel zoom off so the page still scrolls
- "Browse by city" text list under the map is the accessible / no-JS equivalent and shows shops without a location
- Header nav gains 地圖 / Map

### Slice 3 (frontend) — Bilingual home page
- Replaced the English-only placeholder: zh-TW / EN hero, CTAs to `/coffees` and `/map` (dead `/subscribe` link removed)
- 熱門咖啡豆 strip from `popularCoffees` (reuses `CoffeeCard`), 精選店家 from `shops` (reuses `ShopCard`), one `HOME` query
- If the API is down the hero and feature grid still render; data sections show a short bilingual notice
- ~40 new `t()` keys (`map.*`, `home.*`) in both locales

### Cross-cutting — `scripts/smoke.sh`
- Curls `/`, `/coffees`, `/shops`, `/map` (200), an unknown shop (404), `/health`, and a GraphQL query that must return
  seeded map pins + popular coffees; exits non-zero on any failure. Defaults to nginx on `http://localhost`;
  `BASE_URL` / `API_URL` override it

### Verification
- `go build ./...`, `go vet ./...`, `go test ./... -count=1` pass; integration test passes against PostgreSQL 16 with
  migrations 001–002 + seed applied
- `npm run build` passes (7 routes); `docker compose config --quiet` passes
- `next start` + backend: smoke test passes; Playwright: 4 markers rendered, popup shows shop name + city, no page errors,
  no horizontal scroll at 390px. OSM tile requests are blocked in the build sandbox (grey map background there), so
  tile rendering itself was not visually verified. Full `docker compose up` was not re-run this session

### Branch consolidation
Five other scheduled runs had built this same iteration on separate `claude/focused-mendel-*` branches from the
same master commit. This branch keeps its own map/home implementation and adds the useful parts of the others:
- **CI** (`.github/workflows/ci.yml`, from `-4ft3fu`): backend gofmt / build / vet / `go test -race` with Postgres 17
  + migrations + seed; frontend `npm ci` + `tsc --noEmit` + build; `docker compose config`
- **Next.js 15.3.9 → 15.5.29** (from `-h73xwl`): clears the critical `npm audit` advisory; wildcard
  `images.remotePatterns` removed (open image proxy, GHSA-9g9p-9gw9-jx7f; nothing uses `next/image` yet).
  `package-lock.json` re-synced; plain `npm ci` used to fail
- **Migration 003** (from `-8b57gy`): lat/lng range CHECKs on `shops`, NaN rejected
- Discarded as duplicates: the other map / home pages, smoke scripts and shop-pin queries
  (`-1xy7di`, `-6mkm6y` and the rest of `-4ft3fu`, `-8b57gy`, `-h73xwl`)
- Remaining `npm audit`: 7 moderate, 2 high (sharp/libvips, eslint tooling). None critical

### Decisions / deferred
- No CSP header yet; when one is added it must allow `img-src https://tile.openstreetmap.org`
- OSM's public tile server is fine for a demo but its usage policy disallows heavy production traffic — switch to
  a tile provider (or self-hosted tiles) before launch

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
