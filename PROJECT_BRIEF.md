# Moni Cafe — Project Brief

The current picture: goal, status, focus and the reasons behind it. **How** to work (rules, architecture,
verification, the issue workflow) is in [`CLAUDE.md`](CLAUDE.md). The work queue and owner questions are
**GitHub Issues** (labels `slice` and `question`). History is in [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md).

Rewrite "Status", "Last session" and "Current focus" every session; keep this file under 250 lines
(`scripts/check_brief.sh` enforces it in CI).

Last updated: 2026-11-07 (after Session 17)

---

## Final target

**MONI CAFE** is a Taiwan specialty-coffee marketplace — a "Shop app" for roasters. Each seller gets an
auto-generated bilingual storefront; buyers browse, filter and discuss coffees, and later buy them on-platform.

| Stage | Goal | Done when |
|---|---|---|
| **1 — Discovery** (current) | Browse shops / coffees / map, accounts, comments, seller dashboard, image uploads | `docker compose up` gives a complete demo on `http://localhost`; sellers manage everything (incl. images) from the UI; no open `stage-1` slices |
| 2 — Transactions | Cart, orders, ECPay (綠界) payment + CVS pickup / home delivery, order status webhooks | A buyer pays with ECPay sandbox and the seller sees the order |
| 3 — Growth | Meilisearch search, seller analytics, curated collections, email notifications | — |

Product rules that never change: Taiwan only, ships within Taiwan, no green beans; prices in whole NT$;
zh-TW first, English second; sellers never expose personal contact info and can't link out (the platform
takes a commission on each sale).

## Status

| Area | State |
|---|---|
| DB schema + migrations 001–008 | Done |
| Go store (pgx) + GraphQL API for Stage 1 | Done — incl. variant CRUD, delete draft / duplicate coffee |
| Auth (JWT + refresh rotation with 20 s replay grace; BFF cookie flow in Next) | Done — per-device logout + "sign out everywhere" (#73, #74); expired tokens pruned hourly |
| Pages: home, /coffees (+keyword search, filters, sort, in-stock), header search, /coffees/[id] (+paged comments, more from shop, similar from other shops, NT$/100 g, photo gallery), /shops (+search, sort, coffee counts), /shops/[slug] (+search, roast, sort), /map | Done |
| Branded zh/en 404 + error boundary, list skeletons, Open Graph / canonical on detail pages, Product + Store JSON-LD | Done (#92) |
| /login, /register, account menu, /account (display name, change password, saved coffees, my comments, delete account) | Done |
| Comments: add, delete, edit own (with "edited" marker) | Done (#81, #82) |
| Skip-to-content link, one `main` landmark per page | Done (#85) |
| Saved coffees: save toggle + count on coffee pages, list on /account | Done (#87–#89) |
| Account deletion for buyers (password re-check; comments, saves, sessions removed) | Done (#90, #91); sellers: #93 |
| Seller dashboard: open shop, coffees (new / edit / options / publish / duplicate / delete draft, paged, stock badges), shop profile + location, recent comments | Done |
| Draft preview for sellers (dashboard-only, owner chose #8 (b)) | Done |
| Image uploads: presigned API, S3 store (SeaweedFS) behind nginx `/media/`, uploader UI | Done |
| Orphaned-image cleanup (6-hourly sweep of unreferenced objects) | Done (#29) |
| Content-Security-Policy (nonce'd, from the Next 16 proxy) | Done |
| Frontend on Next.js 16; `npm audit` has no high advisories | Done (#35) |
| sitemap.xml (with lastmod) + robots.txt (`SITE_URL`) | Done |
| Rate limiting: login / register / refresh per IP (+ login per email); comments, uploads, password per user | Done |
| Error contract (`graph/errors.go` ↔ `lib/errors.ts`, pinned by a Go test) | Done |
| Structured JSON access + panic logs (slog, request id + trusted client IP) | Done (#48, #53) |
| Postgres pool cap + statement timeout from env | Done (#52) |
| CI: backend, frontend (incl. lint), compose config, **full stack compose + smoke** | Done |
| nginx: gzip for text responses, no server version | Done (#64) |
| Full `docker compose up` through nginx | Verified sessions 8–9 (and in CI) |

## Last session

**Session 17** — no pickable slices again, so six gaps were filed and shipped: saved coffees — API with `isSaved` /
`saveCount` / `User.savedCoffees` (#87), a save toggle on coffee pages (#88) and a list on /account (#89);
`deleteAccount` for buyers (#90) with a BFF route that clears the cookie and an /account section (#91); schema.org
`Store` JSON-LD on shop pages (#92). Verified with race tests on PostgreSQL, Playwright and smoke on a local API + Next.

## Current focus

Stage 1 is complete and Stage 2 (cart, orders, ECPay) is blocked on the owner's answers to #9 (cart storage) and
#12 (commission + payouts). No pickable slices remain after Session 17; next sessions should file real gaps or wait for #9 / #12
(and #50 for a /shops city filter, #93 for seller account closure). Production readiness: set `TRUSTED_PROXIES` to the real proxies only, and
size `DB_MAX_CONNS` × API instances below Postgres' `max_connections`.

Open questions for the owner (answer by commenting on the issue):

| Issue | Question | Default | Safe? |
|---|---|---|---|
| #7 | Image storage | S3-compatible (SeaweedFS in dev) | yes |
| #9 | Cart storage (Stage 2) | Postgres | **no** — blocks #21 |
| #10 | Production map tiles | keep OSM for the demo | yes |
| #12 | Commission + payouts (Stage 2) | none | **no** |
| #42 | Sellers delete comments on their coffees? | no change (author / admin only) | yes |
| #50 | City filter on /shops? | no (use /map) | yes |
| #93 | Seller closes shop / deletes account | manual (contact us) | yes |

## Decisions (why it looks like this)

- **Hand-written pgx store, no sqlc / ORM** — no codegen toolchain; every query is visible in one package.
- **gqlgen with hand-written models + dataloaders** — relationships resolve lazily without N+1 queries.
- **Refresh token in an httpOnly cookie behind Next route handlers** — XSS can't steal a 7-day credential; the
  access token lives only in memory. Refreshes are serialised across tabs because reusing a rotated refresh
  token revokes every session (theft detection).
- **Server components fetch anonymously** — simple caching, no token on the server; the cost is that draft
  pages 404 publicly. Owner chose (b) on #8: drafts stay dashboard-only with a client-rendered preview.
- **Prices as integer NT$** — TWD has no minor unit in practice; integers avoid rounding bugs.
- **UUID keys** — safe to expose in URLs, no enumeration.
- **Bilingual `t()` dictionary instead of an i18n library** — two locales; TypeScript enforces key parity and
  a test checks placeholders.
- **Leaflet + OSM** — no API key for the demo (see #10 for production).
- **Coordinates validated in three places** (GraphQL input, `toShopPin`, DB CHECK in migration 003) — defence in
  depth, because seeds and future admin tools write the table directly.
- **Work queue in GitHub Issues, not a doc** — sessions claim slices with `in-progress`, so parallel or
  overlapping runs don't duplicate work (six runs once rebuilt the same `/map` page); the owner can answer
  questions from a phone.
- **Images: presigned PUTs to an S3-compatible bucket, same-origin via nginx** — the API never proxies file bytes;
  the signed Content-Type / Content-Length cap type and size; only bucket URLs under the owner's prefix can be
  saved, so sellers can't hot-link or link out and the CSP stays narrow. SeaweedFS in dev (MinIO's images were
  pulled from Docker Hub); any S3 provider in production.
- **Refresh replay grace (20 s) with a rotation chain** — browsers abort refreshes on fast navigation and keep the
  old cookie; replaying the just-rotated token re-rotates instead of revoking everything. Cost: a theft replayed
  inside the window isn't detected.
- **Delete is drafts-only** — public links (and Stage 2 orders) never point at a coffee that silently vanished.
- **Rate limits in memory, keyed by trusted client IP / email / user** — no extra infra for one API instance;
  X-Forwarded-For is believed only from `TRUSTED_PROXIES`, and the BFF forwards nginx's. Redis when scaling out.
- **Revoked ≠ reused refresh tokens** — only a *rotated* token presented again means a copy exists (theft); a token
  revoked by logout or password change is just invalid, so old devices can't end the session that revoked them.
- **Orphan cleanup matches keys by shape after listing first** — a CDN / `MEDIA_PUBLIC_URL` change can't make saved
  images look unreferenced; 24 h minimum age protects uploads not saved yet; ≤1000 deletes per run.
- **CSP with per-request nonces** — no `'unsafe-inline'` scripts; styles keep `'unsafe-inline'` for React/Leaflet.
- **Next.js 16 after Stage 1** — owner's answer on #11; done in Session 10 (#35).
- **Loading skeletons only on list pages** — a loading boundary above a detail page streams the response, so
  `notFound()` can't set a 404; list pages sit in `(list)` route groups instead.
- **Comment pages by offset, not cursor** — simple; "load more" dedupes by id, so a new comment can't show twice.
  The dashboard coffee list pages the same way (#49).
- **Price sort = cheapest available, in-stock variant; sold-out last** — matches the "from NT$…" on cards (#44).
- **Duplicate copies details + options, never photos or comments** — image keys are scoped to the source coffee,
  so sharing them would let the orphan sweep or a later edit of one break the other (#54).
- **Keyword search = Postgres ILIKE per word (AND), wildcards escaped** — enough for Stage 1's catalogue with no
  new infra; Meilisearch (Stage 3) can replace it behind the same `CoffeeFilter.search` field (#66).
- **`Comment.coffee` is nullable** — a comment can outlive its coffee's publication; non-owners get null rather
  than a draft (#69). `User.comments` is empty, not an error, for other viewers (#71).
- **Logout ends one device; `logoutEverywhere` ends all** — the cookie's refresh token proves the session, so it
  works with an expired access token; revoked tokens leave the rotation chain so a late replay isn't "theft" (#73).
- **Shop search covers name + description, not city** — a city filter is still the owner's call (#50) (#75).
- **Comment edits are author-only and leave no history** — admins can remove a comment but never rewrite someone's
  words; an "edited" marker is shown instead of keeping old versions (#81).
- **Similar coffees = a SQL score over origin / process / roast / notes, other shops only** — cross-shop discovery
  without new infra; a shared roast alone isn't "similar" (#83).
- **Saved coffees: public count, private list** — the list is self / admin only like "My comments"; drafts drop out of
  it but can still be unsaved; saving a draft is NOT_FOUND, even for its owner (#87).
- **Account deletion deletes comments, refuses shop owners and admins** — personal data goes with the account
  (PDPA); a shop's coffees and links depend on its owner, so seller closure waits on #93 (#90).
- **JSON-LD via one escaped `dangerouslySetInnerHTML`** — React would HTML-escape script text and break the JSON;
  `serializeJsonLd` escapes `< > &` so seller text can't leave the script (#63).
