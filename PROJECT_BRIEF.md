# Moni Cafe — Project Brief

The current picture: goal, status, focus and the reasons behind it. **How** to work (rules, architecture,
verification, the issue workflow) is in [`CLAUDE.md`](CLAUDE.md). The work queue and owner questions are
**GitHub Issues** (labels `slice` and `question`). History is in [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md).

Rewrite "Status", "Last session" and "Current focus" every session; keep this file under 250 lines
(`scripts/check_brief.sh` enforces it in CI).

Last updated: 2026-11-09 (after Session 27)

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

**Look and feel (owner, 2026-11-08):** clean like SEY, La Cabra, Coffee Collective and Poma — a white page
with black type and nothing else. No yellow / amber, no dark "black and yellow" blocks, no gradients. The
wordmark is a heavy, italic, lowercase "moni cafe" in the style of the *motors coffee* sign (#110). Coffees
without a photo get a SEY-style solid tile in a soft Radix colour (steps 4–8) with the coffee's words written
on it (#111). Shipped in Session 20 (#109–#112); `tests/palette.test.mjs` keeps colour utilities out.

## Status

| Area | State |
|---|---|
| DB schema + migrations 001–014 | Done |
| Go store (pgx) + GraphQL API for Stage 1 | Done — incl. variant CRUD, delete draft / duplicate coffee |
| Auth (JWT + refresh rotation with 20 s replay grace; BFF cookie flow in Next) | Done — per-device logout + "sign out everywhere" (#73, #74); expired tokens pruned hourly |
| Coffee provenance: producer, region, growing altitude (API, dashboard form, coffee page + JSON-LD, cards, search) | Done (#116–#120) |
| Brew method (filter / espresso / omni): API + filter, dashboard form, coffee page + JSON-LD, similar coffees (no longer a /coffees filter or on cards, #167) | Done (#122–#127) |
| Harvest year (產季): API + `minHarvestYear` filter, dashboard form, coffee page + JSON-LD, keyword search | Done (#129–#134) |
| Cup profile (酸度 / 甜度 / 醇厚度, 1–5): API + `maxAcidity` filter, dashboard form, coffee page scales + JSON-LD | Done (#136–#141) |
| Sweet / body / high-grown filters: `minSweetness`, `minBody` / `maxBody`, `minAltitudeM` in the API only (site dropped them, #167); "Clear filters" on an empty /coffees | Done (#143–#148) |
| Filter UX: origin / variety / process lists show only values with coffees + counts (`coffeeCount` in the API); removable chips for active filters on /coffees; sidebar from tablet width, filter drawer below it (#165) | Done (#150–#153, #165) |
| Pages: home, /coffees (+keyword search, filters, sort, in-stock), header search, /coffees/[id] (+paged comments, more from shop, similar from other shops, NT$/100 g, photo gallery), /shops (+search, sort, coffee counts), /shops/[slug], /map | Done |
| Branded zh/en 404 + error boundary, Open Graph / canonical on detail pages, Product + Store JSON-LD | Done (#92) |
| /login, /register, account menu, /account (display name, change password, saved coffees, my comments, delete account) | Done |
| Comments: add, delete, edit own (with "edited" marker), "店家 / Roaster" badge on the shop owner's replies | Done (#81, #82, #95, #96) |
| Skip-to-content link, one `main` landmark per page | Done (#85) |
| Saved coffees: save toggle + count on coffee pages, list on /account, "Most saved" sort | Done (#87–#89, #97, #98) |
| Followed shops: follow toggle + count on shop pages, list on /account, home "From roasters you follow", "Most followed" sort, follower count on cards + dashboard | Done (#102–#107) |
| Account deletion for buyers (password re-check; comments, saves, sessions removed) | Done (#90, #91); sellers: #93 |
| Seller dashboard: open shop, coffees (new / edit / options / publish / duplicate / delete draft, paged, stock badges, comments + saves per coffee), shop profile + location, recent comments | Done (#99) |
| Seller-curated shop pages: no buyer filters (#160), seller's order via `reorderShopCoffees` + dashboard ↑ / ↓ (#161, #162), sold-out archive section (#163) | Done |
| Draft preview for sellers (dashboard-only, owner chose #8 (b)) | Done |
| Image uploads: presigned API, S3 store (SeaweedFS) behind nginx `/media/`, uploader UI | Done |
| Orphaned-image cleanup (6-hourly sweep of unreferenced objects) | Done (#29) |
| Content-Security-Policy (nonce'd, from the Next 16 proxy), Permissions-Policy, no X-Powered-By, API nosniff | Done (#100) |
| Frontend on Next.js 16; `npm audit` has no high advisories | Done (#35) |
| sitemap.xml (with lastmod) + robots.txt (`SITE_URL`) | Done |
| Rate limiting: login / register / refresh per IP (+ login per email); comments, uploads, password per user | Done |
| Error contract (`graph/errors.go` ↔ `lib/errors.ts`, pinned by a Go test) | Done |
| Structured JSON access + panic logs (slog, request id + trusted client IP) | Done (#48, #53) |
| Postgres pool cap + statement timeout from env | Done (#52) |
| CI: backend, frontend (incl. lint), compose config, **full stack compose + smoke** | Done |
| nginx: gzip for text responses, no server version | Done (#64) |
| Visual direction: white + black tokens, italic "moni cafe" wordmark (one line, no tagline, #164), Radix colour tiles, shop initials, site icon | Done (#109–#112, #114, #164) |
| Full `docker compose up` through nginx | Verified sessions 8–9 (and in CI) |

## Last session

**Session 27**: shop pages are curated by the seller. Buyer search, filters and sort are gone (#160). There's a
seller-defined order (`shop_position`, `reorderShopCoffees`, `SHOP_ORDER` default, #161) with ↑ / ↓ in the dashboard
(#162). Sold-out coffees move to a greyed "已售完 · 封存" archive (`inStock: false`, #163). The wordmark has no tagline
and reads "moni cafe" at one size (#164). /coffees keeps its sidebar from 768 px, with a shared `Drawer` below that
(#165). Verified with race tests on PostgreSQL, smoke (except `/media/`) and Playwright at 390–1280 px.

## Current focus

1. **#167** (p1): carry out the owner's answer on #166. /coffees keeps search, sort, origin, variety, process, price
   and in stock. Cards lose the brew tag. The API filters stay. Rewrite the related Decisions below.
2. **#175** (p1): navigation drawer below `lg`. Reuse `components/Drawer.tsx`. The phone header still wraps to two rows.
3. p2: **#156** (list pages invisible without JS; this also hides #165's no-JS fallback), **#169** → **#174**
   (reference-shop scaffolding, then missing origins / varieties / processes). #170–#173 need the roaster domains
   reachable (see #168: the proxy still answers 403).
4. Stage 2 (cart, orders, ECPay) stays blocked on #9 and #12. Production: set `TRUSTED_PROXIES` to the real proxies
   only, and keep `DB_MAX_CONNS` × API instances below Postgres' `max_connections`.

Open questions for the owner (answer by commenting on the issue):

| Issue | Question | Default | Safe? |
|---|---|---|---|
| #7 | Image storage | S3-compatible (SeaweedFS in dev) | yes |
| #9 | Cart storage (Stage 2) | Postgres | **no**: blocks #21 |
| #10 | Production map tiles | keep OSM for the demo | yes |
| #12 | Commission + payouts (Stage 2) | none | **no** |
| #42 | Sellers delete comments on their coffees? | no change (author / admin only) | yes |
| #50 | City filter on /shops? | no (use /map) | yes |
| #93 | Seller closes shop / deletes account | manual (contact us) | yes |
| #158 | Shop page curation details | manual order, new at end, archive by stock (built) | yes |
| #159 | Header tagline | dropped from the header (built) | yes |
| #176 | Which coffee fields are required | variety optional, ≥ 1 flavour note required, essentials grouped | yes |
| #177 | Nav drawer widths | below `lg` only | yes |

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
- **No loading boundaries (#156)** — a `loading.tsx` makes Next stream the page into hidden placeholders that only an
  inline script reveals, so without JavaScript /coffees and /shops showed a skeleton forever. Header and pagination links
  show a pending dot (`useLinkStatus`) instead; a test keeps `loading.*` out of `app/`.
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
- **"Roaster" badge derived from shop ownership, not stored** — `Comment.fromShop` is an `EXISTS` on every read, so
  there is no flag to forge or keep in sync (#95).
- **White + black visual style, no amber or gradients** — the owner's call (2026-11-08) after comparing with SEY /
  La Cabra / Coffee Collective / Poma; the only colour is the soft Radix tile behind a coffee with no photo (#109–#112).
- **Follows: public count, private list** — like saves; nobody (the seller included) sees who follows a shop, and
  owners can't follow themselves, so the count means other people (#102).
- **Provenance as plain columns, altitude in metres, set as a pair** — producer / region are free text (≤ 100) rather than
  curated lists (farms are too many); altitude min alone = one height; updates replace both ends so max ≥ min holds (#116).
- **Brew method, harvest year and cup profile are listing details, not /coffees filters** — one brew method per coffee
  (omni = both), one harvest year (no future crops), three 1–5 scales set as a group, as bags print them (#122, #129,
  #136). They show on the coffee page and in JSON-LD. The API keeps every filter (`brewMethod`, `minHarvestYear`,
  `maxAcidity`, `minSweetness`, `minBody` / `maxBody`, `minAltitudeM`, `roastLevel`, `flavorNote`), but the site no longer
  offers them: the owner reversed #127 / #133 / #140 / #145 / #146 on #166 because each shop rates these by its own
  standard. For the same reason "similar" no longer compares acidity; a shared brew method still reorders (#167).
- **Filter options = values with published coffees, counted catalogue-wide; chips are plain links** — hidden, not greyed,
  and the selected one always stays; counts ignore the other filters (no per-combination facet queries); the phone
  toggle is CSS-only (checkbox + label) so nothing depends on hydration (#151–#153).
- **Coffee tile colour from the coffee id; Radix hex values copied, not a dependency** — the same coffee is the same
  colour everywhere and a rename doesn't change it; 85 MIT-licensed constants need no package (#111).
- **/coffees filters = origin / variety / process / price / in stock (owner, #166; built #167)**: each shop rates cup
  profile, roast and brew by its own standard, so filtering across shops on them misleads. Old links with the removed
  params show the unfiltered list; cards show only the roast. Keyword search and sort stay.
- **Reference roasters' lists come over the network (owner, #168 (a))**: the environment's allow-list gets
  lab19coffee.com, seycoffee.com, pomacoffee.com and onyxcoffeelab.com. Until sessions can reach them, #170–#173 stay
  blocked.
- **Shop pages are the seller's storefront (#158 defaults)**: no buyer controls. The order is the seller's
  (`shop_position`, new coffees at the end, not unique, rewritten as a whole). Sold out = no available option with
  stock, shown in an archive below, and nothing changes on /coffees. Reordering doesn't touch `updated_at` (#160–#163).
- **One `Drawer` (modal `<dialog>`) for side panels**: the browser gives focus trapping, Esc and an inert page. A closed
  dialog is shown inline by CSS where the content is a sidebar, so the same markup serves both (#165).
