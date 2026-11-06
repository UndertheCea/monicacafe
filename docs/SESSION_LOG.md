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

## Session 14 — 2026-11-06 — Coffee keyword search, seller recent comments, My comments
PR: (this session's PR into master)

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code.

### Shipped (one line per slice: area — what — key files)
- #66 backend — `CoffeeFilter.search`: every word must appear (ILIKE substring, `% _ \` escaped by
  `store.LikePattern`) in name, description, a flavor note, shop name, origin / variety / process (zh + en);
  > 100 chars or > 8 words → `BAD_USER_INPUT` (`searchTerms` in `graph/helpers.go`)
- #67 frontend — /coffees search field (`?q=`, `parseSearchParam` collapses + caps to the API limits), results
  heading, search-specific empty state with "clear search" that keeps other filters
- #68 frontend — header `role="search"` GET form → `/coffees?q=` (`HeaderSearch`, `searchHref`), works without JS,
  prefilled on /coffees; hidden below `sm` (the /coffees form covers phones)
- #69 backend — `Shop.recentComments(limit, offset): CommentConnection!` (owner / admin; drafts included) and
  `Comment.coffee: Coffee` (nullable; `CoffeeByID` loader; null for someone else's draft)
- #70 frontend — dashboard "最新留言 / Recent comments" via a shared `CommentFeed` (author, coffee link — public page
  or draft preview — date, text-only body, load more, delete for your own rows)
- #71 cross-cutting — `User.comments` (self / admin; empty for others, never an error) + /account "我的留言 / My
  comments" with delete and load more (`withoutComment`, `commentCoffeeHref` in `lib/comments.ts`)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestLikePattern`, `TestSearchTerms`, `TestCoffeeSearch`, `TestShopRecentComments`, `TestUserComments`.
- Frontend: tsc, lint, `npm test` (82), `next build`; `docker compose config`, `check_brief.sh`.
- Ran the API binary + Next standalone locally; Playwright: header search → /coffees?q= with both fields prefilled,
  empty state + clear link keeps `roast`, dashboard shows a buyer comment (`<b>` rendered as text), /account lists
  it and deletes it (empty state after). Only console errors: the existing anonymous `/api/auth/refresh` 401.
- `scripts/smoke.sh` (with new search checks) against that local stack: all ok except the two `/media/` checks (no
  SeaweedFS / nginx here). Not run: `docker compose up --build` (Go / npm proxies fail inside the build here).

### Decisions / deferred (anything the next session or the owner should know)
- Search is Postgres ILIKE (no index): fine for the Stage 1 catalogue; Stage 3 swaps in Meilisearch behind the same
  `CoffeeFilter.search` field.
- Sellers still can't delete buyers' comments in the new dashboard panel (#42 default); the delete button there
  only appears on comments the viewer wrote (or for admins).

## Session 13 — 2026-11-06 — Shop coffee counts + sort, photo gallery, Product JSON-LD, nginx gzip
PR: (this session's PR into master)

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code.

### Shipped (one line per slice: area — what — key files)
- #59 backend — `Shop.coffeeCount` (published only, even for the owner) via a `CoffeeCountByShop` dataloader
  (`store.PublishedCoffeeCountsByShopIDs`); count loaders share `countLoader`
- #60 backend — `shops(city, sort: ShopSort { NEWEST NAME MOST_COFFEES })`; whitelisted `store.ShopSort.orderBy`,
  ties newest-then-id; MOST_COFFEES counts published coffees like `coffeeCount`
- #61 frontend — shop cards show "N 款咖啡" / "尚未上架咖啡" (also on home); `/shops` GET sort form
  (`?sort=name|coffees`, kept across pages) — `lib/shopQuery.ts`, shared `SortForm` in `ShopSortForm.tsx`
- #62 frontend — `PhotoGallery` (client): every photo (≤ 8) as a thumbnail button (`aria-pressed`, arrow keys),
  click swaps the large image; used by the public page and the draft preview — `lib/gallery.ts`
- #63 frontend — schema.org `Product` + TWD `AggregateOffer` JSON-LD on public coffee pages (`coffeeJsonLd`,
  `serializeJsonLd` escaping `< > &` U+2028/9 in `lib/seo.ts`), with the CSP nonce; smoke checks it
- #64 cross-cutting — nginx `gzip` for text types (HTML, JS, CSS, JSON, XML, SVG; ≥ 1 KB, `Vary`) and
  `server_tokens off`; smoke checks both

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestPublishedCoffeeCountsByShopIDs`, `TestListShopsSort`, `TestShopSortOrderBy`,
  `TestShopColumnsAs`, `TestStoreShopSort`, `TestShopCoffeeCount` (incl. every sort through the API).
- Frontend: tsc, lint, `npm test` (77), `next build`.
- Stack: `docker compose up --build` can't build here (Go / npm proxies fail TLS inside the build). Instead ran
  the API binary + Next standalone locally behind the real `nginx/nginx.conf` (nginx:1.27-alpine container,
  upstreams pointed at localhost) and ran `scripts/smoke.sh`: everything passed (incl. new gzip, server version
  and JSON-LD checks) except the two `/media/` checks — no SeaweedFS here (502). CI `stack` covers media.
- Playwright: `/shops?sort=coffees` orders by count and keeps the sort on page links; a coffee with 3 photos
  shows 3 thumbnails, click and ArrowRight swap the hero; JSON-LD present. No page errors.

### Decisions / deferred (anything the next session or the owner should know)
- JSON-LD is the one `dangerouslySetInnerHTML` in the app: JSON escaped by `serializeJsonLd` (tested), no HTML.
- Shop page header keeps using `coffees.total` (anonymous fetch = published only), same number as `coffeeCount`.

## Session 12 — 2026-11-06 — DB pool limits, JSON panic logs, duplicate coffee, shop sort, per-100 g, stock badges
PR: (this session's PR into master)

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code.

### Shipped (one line per slice: area — what — key files)
- #52 backend — `DB_MAX_CONNS` (10) and `DB_STATEMENT_TIMEOUT` (10s, 0 = off), validated by `config.DBPool`,
  applied by `db.New(ctx, dsn, db.Options)` over the DSN; `.env.example` + compose
- #53 backend — `middleware.Recover` replaces chi's `Recoverer`: one slog Error record (panic, stack, method, path,
  request_id, headers_sent), 500 unless headers went out, `http.ErrAbortHandler` re-panicked
- #54 cross-cutting — `duplicateCoffee(id, name)`: new draft in one transaction with details, notes and every
  variant (price, stock, availability); no photos (keys are scoped to the source coffee), no comments. Dashboard
  "Duplicate" → opens the copy's edit page; name gets a localized suffix trimmed to 120 chars (`copyName` in Go
  and `lib/dashboard/duplicateCoffee.ts`)
- #55 cross-cutting — `Shop.coffees(sort:)` reuses `storeSort`; `/shops/[slug]` GET sort form (`ShopSortForm`),
  kept across pagination, canonical unchanged
- #56 frontend — "NT$X / 100 g" under each variant price (`lib/pricing.ts`, integer round-half-up; hidden for
  100 g bags), on the coffee page and the draft preview
- #57 frontend — dashboard "Sold out" / "Low stock (n)" badges (`lib/dashboard/stockStatus.ts`, low ≤ 5 units
  across available options)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestPoolConfig`, `TestDBPool`, `TestRecover`, `TestRecoverRepanicsAbortHandler`, `TestCopyName`,
  `TestDuplicateCoffee`, `TestShopCoffeesSort`. S3 tests skipped (no store).
- Frontend: tsc, lint, `npm test` (68), `next build`. Ran the standalone server against the local API and drove
  it with Playwright: shop sort form → `?sort=price_asc` gives Cheap, Mid, Pricey, SoldOut; coffee page shows
  "每 100 g NT$150"; dashboard shows 已售完 / 庫存偏低（3）badges; "複製" opens the new draft named
  "Low Bean（複本）" and the list grows to 4. No page errors.
- NOT run here: `docker compose up` + `smoke.sh` (no Docker daemon) — left to the CI `stack` job. The statement
  timeout was checked by unit test only (no slow-query test against a live server).

### Decisions / deferred (anything the next session or the owner should know)
- `duplicateCoffee` copies variant stock as-is; sellers adjust it on the edit page.
- Names: the frontend sends the localized copy name; the API's default suffix is " (copy)".

## Session 11 — 2026-11-06 — Sorting, in-stock filter, more-from-shop, JSON access logs, dashboard paging
PR: (this session's PR into master)

No slices were pickable at the start (Stage 2 still blocked on #9 / #12), so the six below were filed from gaps
found in the code.

### Shipped (one line per slice: area — what — key files)
- #44 backend — `coffees(filter, sort, …)` with `CoffeeSort { NEWEST PRICE_ASC PRICE_DESC MOST_DISCUSSED }`;
  price sorts use the lowest available, in-stock variant (LATERAL join), sold-out last both ways, ties
  newest-then-id — `store.CoffeeSort.orderBy`, `graph.storeSort`
- #45 frontend — sort `<select>` in the GET filter form, `?sort=price_asc|price_desc|discussed` —
  `lib/coffeeQuery.ts` (import-free so `npm test` loads it)
- #46 cross-cutting — `CoffeeFilter.inStock` (EXISTS an available variant with stock) + sidebar checkbox
  `?instock=1`; store `where()` now has a table-driven test
- #47 frontend — "More from {shop}" on the coffee page: `COFFEE_PAGE` aliases `more: shop { coffees(limit: 5) }`
  in the same request (no extra fetch, none on 404); `lib/moreFromShop.ts`; shared `CARD_FIELDS`
- #48 backend — `middleware.AccessLog` (slog JSON: method, path without query, status, bytes, duration_ms,
  request_id, client_ip) replaces chi's text Logger; 5xx Error, 4xx Warn, `/health` Debug (hidden)
- #49 frontend — dashboard lists 50 coffees + "load more" (`MY_SHOP_COFFEES`, `lib/dashboard/coffeePages.ts`);
  publish / unpublish update the row in place instead of refetching page one

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestListCoffeesSort` (all four orders, paging, in-stock), `TestCoffeeSortOrderBy`,
  `TestCoffeeFilterWhere`, `TestStoreSort`, `TestAccessLevel` / `TestAccessLog`. S3 tests skipped (no store).
- Frontend: tsc, lint, `npm test` (63), `next build`. Ran the standalone server against the local API and drove
  it with Playwright: sort + in-stock via the form (kept after submit), "more from" shows 2 cards on a 3-coffee
  shop and nothing on a 1-coffee shop, dashboard with 57 coffees shows 50 → 57 after "load more", publishing a
  loaded-more row keeps all 57. Access log lines checked by eye in the server output.
- NOT run here: `docker compose up` + `smoke.sh` — left to the CI `stack` job.

### Decisions / deferred (anything the next session or the owner should know)
- New question #50: city filter on /shops? Safe default: no (nothing built).
- `sort` is a top-level argument, not part of `CoffeeFilter` (it orders, it doesn't narrow).
- chi's `Recoverer` still prints panic stacks as text to stderr; the access log records the resulting 500.

## Session 10 — 2026-11-06 — Next.js 16, lint gate, comment paging, 404/error/loading pages, share cards
PR: (this session's PR into master)

### Shipped (one line per slice: area — what — key files)
- #35 frontend — Next 16.4.5 / React 19.3.1; `middleware.ts` → `proxy.ts` (Next 16 rename, same nonce'd CSP);
  `next lint` gone → flat `eslint.config.mjs`; tsconfig `jsx: react-jsx`. `npm audit`: 0 high (sharp + Next's
  bundled postcss fixed), 8 moderate left in eslint/typescript-eslint dev tooling. smoke checks the CSP nonce
- #37 cross-cutting — `npm run lint` (`--max-warnings 0`) passes and runs in CI; fixed 7 react-hooks errors
  (dashboard loaders return the next state and the mount effect sets it from the promise with a stale-response
  guard; AccountMenu closes on navigation during render; LocationPicker ref updated in an effect)
- #38 cross-cutting — `Coffee.comments(limit, offset)` (default 20, max 100; was a fixed 100). Coffee page
  server-renders 20 + "load more" (`MoreComments`, `lib/comments.ts` dedupes rows shifted by new comments);
  deleting a loaded-more comment removes it locally
- #39 frontend — global `app/not-found.tsx` (zh/en) and `app/error.tsx` (locale from `<html lang>` via
  `useHtmlLocale`), list-page skeletons, Pagination aria-label via t(). Skeletons sit in `(list)` route groups:
  a loading boundary above `/coffees/[id]` streamed the response and turned `notFound()` into **200**
- #40 frontend — `lib/seo.ts`: canonical + Open Graph + Twitter card on coffee and shop pages from `SITE_URL`
  (first usable image made absolute; non-http schemes dropped)
- #41 cross-cutting — smoke loads one coffee + one shop from the sitemap (200, name, og:url, canonical), and
  expects 404 for an unknown coffee id and an unknown path

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed); `TestMarketplaceFlow` now pages three comments over two pages. No S3 store this session, so the S3 tests
  skipped.
- Frontend: tsc, lint, `npm test` (56), `next build`. Ran the standalone server against the local backend: the
  smoke route/CSP/sitemap/detail/404 sections pass; Playwright clicked "load more" on a coffee with 45 comments
  (20 → 40 → 45, no duplicates, button gone at the end); zh/en 404 checked with the locale cookie.
- NOT run here: `docker compose up` + the full `smoke.sh` (nginx, media, BFF) — left to the CI `stack` job.
  `app/error.tsx` wasn't triggered by a real render error.

### Decisions / deferred (anything the next session or the owner should know)
- Owner answered #8 (b) and #11 (b): recorded in the brief, both closed.
- New question #42: may sellers delete comments on their coffees? Safe default: no change.
- Detail pages have no loading skeleton on purpose (status codes > skeletons). The comment offset paging can skip
  one row if someone *else* deletes a comment between two "load more" clicks; acceptable for now.
- Shops could be filtered by city (the API supports it) but nothing in the UI uses it; not filed because rule 9
  (no location-based *coffee* filters) makes it worth asking first.

## Session 9 — 2026-11-05 — Rate limits, account settings, orphaned-image cleanup, one error contract
PR: #36

### Shipped (one line per slice: area — what — key files)
- #27 backend — in-memory token buckets (`internal/ratelimit`) on `login` (per IP + per email), `register` and
  `refreshToken` (per IP) → `RATE_LIMITED` + `retryAfter`; BFF answers 429 + `Retry-After`, forms say "try again in
  N" (zh/en). Client IP from new `middleware.ClientIPMiddleware`: walks X-Forwarded-For only past
  `TRUSTED_PROXIES` (replaces chi `RealIP`, which trusted anyone); the BFF forwards nginx's XFF — `RATE_LIMIT_*`
- #31 backend — per-user limits on `addComment` (valid comments only) and `createImageUpload`; comment form and
  uploader show the shared message from `frontend/lib/errors.ts`
- #32 backend — `updateProfile(displayName)` and `changePassword(current, new)`: new hash + revoke every refresh
  token in one tx, fresh tokens for this session; wrong current password is `BAD_USER_INPUT` on
  `currentPassword` (clients retry `UNAUTHENTICATED` after a refresh); per-user limit. **Behaviour change to #24:**
  a refresh token revoked on purpose (logout / password change) is now just invalid, not "reuse" — otherwise an
  old device refreshing after a password change would end the new session. Rotated tokens replayed outside the
  grace window still revoke everything — `auth.ClassifyRefresh`
- #33 frontend — `/account` (menu link "帳號設定"): display name + change password; BFF action
  `/api/auth/password` puts the rotated refresh token in the cookie; AuthProvider `changePassword()` retries once
  after a refresh on 401 and tells other tabs. robots.txt disallows /account
- #34 cross-cutting — deleted the never-imported `internal/apperr`; `lib/errors.ts` documents the real contract
  (`code`, `field`, `retryAfter`) with `parseGraphQLErrors`; `ApiError` lost the never-sent zh/en messages;
  `ErrorState` shows a `t()` message by code instead of the raw English backend message. Go test
  `graph/errors_contract_test.go` fails when backend codes and `API_ERROR_CODES` drift
- #29 backend (stage-2) — `internal/mediaclean.Sweep`: lists `shops/` + `coffees/` (ListObjectsV2 via the SigV4
  presigner, now with signed query params), then reads every saved URL (`store.ImageURLs`), deletes unreferenced
  objects older than `MEDIA_CLEANUP_MIN_AGE` (24h), ≤1000 per run, every `MEDIA_CLEANUP_INTERVAL` (6h). Keys are
  matched by shape, not by `MEDIA_PUBLIC_URL`, so a CDN switch can't orphan everything. New
  `S3_INTERNAL_ENDPOINT` (compose: `http://seaweedfs:8333`) for server-side calls

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` against local PostgreSQL 16 (migrations + seed) **and** a local
  SeaweedFS 4.52 container (`TEST_S3_*`), so `TestImageUploads` and the new `TestMediaCleanup` ran for real. New:
  `TestParseRule`, `TestLimiterAllow`, `TestClientIP`, `TestRateLimits`, `TestMediaCleanup` (config),
  `TestAuthRateLimits`, `TestCommentRateLimit`, `TestAccount`, `TestValidatePasswordChange`, `TestImageKeyIn`,
  `TestOrphans`, `TestParseListObjects`, `TestSweep`, `TestErrorCodesMatchFrontend` (also checked it fails on drift).
- Frontend: tsc, `npm test` (49 cases), `next build`.
- Full stack: dockerd in the session, images built with the sandbox CA via local-only Dockerfile copies (not
  committed); `docker compose up --wait` healthy; `smoke.sh` passes, incl. the new checks: `/account` 200, change
  password via BFF (new cookie refreshes, old one 401), 11th wrong login for one email → 429 + Retry-After. Backend
  logs show BFF calls from the browser's IP (docker gateway), not the frontend container.
- NOT tested: `/account` forms and the rate-limit messages driven in a real browser (only via smoke/curl and unit
  tests); the periodic cleanup ticker itself in compose (6 h; `Sweep` is covered against SeaweedFS).

### Decisions / deferred (anything the next session or the owner should know)
- `TRUSTED_PROXIES` defaults to loopback + private ranges (fits compose). Production must list only its own
  proxies and not expose :3000 / :4000, or anyone can claim any client IP.
- Limits are per API instance (in memory); move to Redis when scaling out. Per-email login limit also counts
  unknown emails (doesn't reveal accounts) — the cost is that someone can lock an account's logins for minutes.
- Other sessions' *access* tokens stay valid up to 15 min after a password change (only refresh is revoked).
- Stage 1 has no open slices after this PR; Stage 2 is still blocked on #9 (cart) and #12 (commission). New slice
  #35: Next.js 16 upgrade (#11 default "after Stage 1" now applies).

## Session 8 — 2026-11-05 — Stack proven end to end, refresh grace window, draft preview / delete, sitemap
PR: (see the merged PR for this branch)

### Shipped (one line per slice: area — what — key files)
- #24 cross-cutting — refresh rotation is one transaction that records the successor (migration 005
  `refresh_tokens.replaced_by`). A just-rotated token presented again within `auth.RefreshReuseGrace` (20 s) while
  its successor is unused retires that successor and issues a new token; outside the window, after logout, or
  once the successor was used, it is reuse and revokes everything — `internal/auth/refresh.go`
  (`ClassifyRefresh`), `store.RotateRefreshToken`
- #19 frontend — `/dashboard/coffees/[id]/preview`: client fetch with the seller's token, same
  `CoffeeDetailView` as the public page (extracted from it), bilingual draft banner; public `/coffees/[id]` still
  404s for drafts. `canManageCoffee` replaces the inline ownership check — `components/dashboard/CoffeePreview.tsx`
- #20 cross-cutting — `docker compose up` + `smoke.sh` verified on a real Docker daemon; smoke now drives the
  `/api/auth` cookie through nginx (register → refresh rotates → replay within grace → logout → 401). New CI job
  `stack` runs compose + smoke on every PR
- #25 backend — `store.PruneRefreshTokens` deletes expired rows in batches; the API runs it at start and every
  `TOKEN_PRUNE_INTERVAL` (default 1h, ≥1m, 0 = off) — `cmd/server/main.go`, `config.TokenPruneEvery`
- #26 cross-cutting — `deleteCoffee(id)`: owner/admin, drafts only (CONFLICT when published, checked under a row
  lock), variants + comments cascade; dashboard Delete with inline confirm on list rows and the edit page
- #28 frontend — `app/sitemap.ts` (static pages + every shop + every published coffee, paged through the API) and
  `app/robots.ts` (replaces `public/robots.txt`; Sitemap line from new `SITE_URL`; disallows /dashboard, /api/)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` against a local PostgreSQL 16 with migrations 001–005 + seed.
  New: `TestClassifyRefresh`, `TestTokenPruneEvery`, `TestPruneRefreshTokens`, `TestDeleteCoffee`, and the
  marketplace test now replays a rotated token inside (accepted) and outside (family revoked) the window.
  `TestImageUploads` skipped locally (no `TEST_S3_*`); CI runs it.
- Frontend: tsc, `npm test` (38 cases), `next build`.
- Full stack: `dockerd` started in the session; images built with the sandbox's TLS-proxy CA injected through a
  local-only Dockerfile copy (not committed — CI and real machines don't need it). `docker compose up --wait` on
  fresh volumes: all services healthy; `smoke.sh` passes (pages, sitemap, robots, auth cookie flow, GraphQL,
  `/media/` upload). Playwright against that stack: draft preview (banner, 404 publicly), delete from the list
  and from the edit page, rapid navigation stays signed in.
- NOT reproduced in a browser: an actually aborted refresh (Playwright's rapid navigation didn't abort one this
  time); the replay path is covered by smoke.sh and the integration test instead. The new `stack` CI job runs for
  the first time on this PR.

### Decisions / deferred (anything the next session or the owner should know)
- Grace window trade-off: a stolen refresh token replayed within 20 s of a legitimate rotation isn't detected.
- Deleting a coffee leaves its images in the bucket (unreachable): new slice #29 (orphan-image cleanup, stage-2).
- New slice #27: rate-limit login / register / refresh (no throttling today).

## Session 7 — 2026-11-05 — Dashboard edits, image uploads end to end, CSP
PR: #23

### Shipped (one line per slice: area — what — key files)
- #13 frontend — edit coffee details on `/dashboard/coffees/[id]` (only changed fields sent; shared
  `coffeeDetailsProblem` validation with the new-coffee form); backend `updateCoffee.clearVariety` —
  `components/dashboard/CoffeeDetailsForm.tsx`, `lib/dashboard/validate.ts`
- #14 frontend — `/dashboard/shop`: name / city / description + Leaflet click-to-place (draggable) pin or typed
  lat/lng, warning outside Taiwan's rough bounds (incl. Penghu, Kinmen, Matsu) — `ShopProfileForm.tsx`,
  `LocationPicker.tsx`
- #15 backend — `createImageUpload(kind, targetId, contentType, byteSize)`: ownership check, jpeg/png/webp ≤ 5 MB,
  10-minute presigned PUT with Content-Type + Content-Length **signed** (size enforced by the store). Hand-written
  SigV4 presigner (no AWS SDK) checked against AWS's published example. `updateShop` logo/banner and new
  `updateCoffee.imageUrls` (≤ 8, ordered, deduped) accept only bucket URLs under that shop's / coffee's prefix;
  `""` clears a logo/banner — `internal/storage/`, `S3_*` + `MEDIA_PUBLIC_URL` in `config.Load()`
- #16 cross-cutting — S3 store in compose + nginx `/media/` (same-origin uploads and image URLs, Host kept for the
  signature), smoke checks incl. a real presigned PUT + GET. **SeaweedFS** (`chrislusf/seaweedfs:4.52`) instead
  of MinIO: `minio/minio` is no longer pullable from Docker Hub (CI failed on it). `scripts/seaweedfs.sh` writes
  the identities (admin key; anonymous GET on `shops/*` + `coffees/*` only) and creates the bucket
- #17 frontend — `ImageUploader` (client type/size check, XHR PUT with progress) for shop logo + banner and the
  coffee gallery (add / remove / reorder, first = cover); bilingual alt text — `ImageUploader.tsx`,
  `ShopImages.tsx`, `CoffeeGallery.tsx`, `lib/dashboard/upload.ts`
- #18 cross-cutting — nonce'd CSP from `middleware.ts` (pure builder `lib/csp.ts`): img-src self + media + OSM
  tiles, connect-src self + GraphQL + media, frame-ancestors none, etc. New build arg `NEXT_PUBLIC_MEDIA_URL`

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with a local PostgreSQL 16 (migrations + seed). New:
  `internal/storage` tests (AWS SigV4 vector, URL ownership, config), `TestImageUploads`, clearVariety check.
- CI additionally runs SeaweedFS and `TestImageUploads` does a **real** presigned PUT (and a wrong-size PUT that
  must fail) plus an anonymous GET — green.
- Frontend: tsc, `npm test` (31 cases), `next build`. Playwright (Chromium) against local backend + Postgres:
  #13 save incl. clearing variety, #14 map click / outside-Taiwan warning / save, #17 uploads, reorder, oversize
  rejection, logo on `/shops/[slug]` (a stand-in S3 endpoint, no signature check, served the files). #18: a
  production build swept every `smoke.sh` page plus the signed-in dashboard pages and an upload — no CSP violations.
- NOT tested: `docker compose up` + `smoke.sh` (no Docker daemon here; that's #20), SeaweedFS behind nginx (the
  Host-preserving proxy is configured but only exercised directly on :8333 in CI), OSM tiles (blocked egress).

### Decisions / deferred (anything the next session or the owner should know)
- Dev image store is SeaweedFS, not MinIO (images gone from Docker Hub). Same S3 code path; #7's default stands.
- Image URLs must come from our bucket; pre-existing off-bucket URLs (none in the seed) would be blocked by the CSP.
- A shop's saved location can't be cleared (`updateShop` null = unchanged); the page says so.
- New slice #24: navigating away while `/api/auth/refresh` is in flight loses the rotated cookie and the next load
  trips reuse detection, logging the user out everywhere. Found while testing; needs a grace window.
- `smoke.sh` now creates a throwaway "smoke…" user + shop each run (`SMOKE_UPLOAD=0` skips).

---

## Maintenance — 2026-11-05 — CLAUDE.md, backlog in GitHub Issues, brief check

- `CLAUDE.md` (auto-loaded by Claude Code): rules, architecture, verify commands, issue workflow.
- Backlog and owner questions moved from the brief to GitHub Issues: questions #7–#12 (`question`),
  slices #13–#21 (`slice` + `priority:*` + `area:*` + `stage-*`; #21 `blocked` on #9).
- `PROJECT_BRIEF.md` cut to goal / status / last session / current focus / decisions (86 lines).
- `scripts/check_brief.sh` in CI: brief ≤ 250 lines and required sections present.

---

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
