# Moni Cafe — Project Brief

The current picture: goal, status, focus and the reasons behind it. **How** to work (rules, architecture,
verification, the issue workflow) is in [`CLAUDE.md`](CLAUDE.md). The work queue and owner questions are
**GitHub Issues** (labels `slice` and `question`). History is in [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md).
The order of the work ahead, and why, is in [`docs/ROADMAP.md`](docs/ROADMAP.md) (review of 2026-11-10).

Rewrite "Status", "Last session" and "Current focus" every session; keep this file under 250 lines
(`scripts/check_brief.sh` enforces it in CI).

Last updated: 2026-11-14 (after Session 38)

---

## Final target

**MONI CAFE** is a Taiwan specialty-coffee marketplace — a "Shop app" for roasters. Each seller gets an
auto-generated bilingual storefront; buyers browse, filter and discuss coffees, and later buy them on-platform.

| Stage | Goal | Done when |
|---|---|---|
| **1 — Discovery** (unblocked work done) | Browse shops / coffees / map, accounts, comments, seller dashboard, image uploads | `docker compose up` gives a complete demo on `http://localhost`; sellers manage everything (incl. images) from the UI; no open `stage-1` slices |
| **2 — Transactions** (current, owner on #197) | Cart, orders, ECPay (綠界) payment + CVS pickup / home delivery, order status webhooks | A buyer pays with ECPay sandbox and the seller sees the order |
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
| DB schema + migrations 001–019, tracked in `schema_migrations` and applied on every `docker compose up` (`scripts/migrate.sh`) | Done (#209) |
| Go store (pgx) + GraphQL API for Stage 1 | Done — incl. variant CRUD, delete draft / duplicate coffee |
| Auth (JWT + refresh rotation with 20 s replay grace; BFF cookie flow in Next) | Done — per-device logout + "sign out everywhere" (#73, #74); expired tokens pruned hourly; only a 401 signs out, hiccups retry (#228); no refresh call without the `mc_s` hint (#234) |
| Coffee listing details: provenance (#116–#120), brew method (#122–#127), harvest year (#129–#134) on the API, forms, coffee page + JSON-LD; cup profile removed (#189); `minAltitudeM` / brew / harvest filters in the API only (#167) | Done |
| Filter UX: origin / variety / process lists show only values with coffees + counts (`coffeeCount` in the API); removable chips for active filters on /coffees; sidebar from tablet width, filter drawer below it (#165) | Done (#150–#153, #165) |
| Search: zh-TW ↔ English synonyms + simplified → traditional (`internal/search`); "Matched: …" line on results (`searchTerms`) | Done (#269, #274) |
| Pages: home, /coffees (+keyword search with a removable chip, filters, sort, in-stock), header search, /coffees/[id] (+price / sold-out under the name, flavour notes link to search, paged comments, more from shop, similar from other shops, NT$/100 g, photo gallery), /shops (+search, sort, coffee counts), /shops/[slug], /map | Done |
| Branded zh/en 404 + error boundary, Open Graph / canonical on detail pages, home and listings (search results `noindex`), Product + Store JSON-LD | Done (#92, #195) |
| /login, /register, account menu, /account (display name, change password, saved coffees, my comments, download my data (#270), delete account) | Done |
| Comments: add, delete, edit own (with "edited" marker), "店家 / Roaster" badge on the shop owner's replies | Done (#81, #82, #95, #96) |
| Accessibility: skip link, one `main`; text ≥ 4.5:1 (tested from the tokens), 44 px tap targets, `lang` spans, count-only live region; axe clean on six pages | Done (#85, #231) |
| Design system: tokens, flat cards, one `<Page>` width (#229); `components/ui` Button / Field / Card / headings / Badge / Picture, one box radius (#230); errors under each field + focus, `ConfirmButton` (#232) | Done |
| Saved coffees + followed shops: toggles + counts, lists on /account, "Most saved" / "Most followed" sorts, home "From roasters you follow", follower count on cards + dashboard | Done (#87–#89, #97, #98, #102–#107) |
| Account deletion for buyers (password re-check; comments, saves, sessions removed) | Done (#90, #91); sellers: #93 |
| Seller dashboard: open shop, coffees (new / edit / options / publish / duplicate / delete draft, paged, stock badges, comments + saves per coffee), shop profile + location, recent comments; draft preview (owner, #8 (b)) | Done (#99) |
| Seller-curated shop pages: no buyer filters (#160), seller's order via `reorderShopCoffees` + dashboard ↑ / ↓ (#161, #162), sold-out archive section (#163) | Done |
| Image uploads: presigned API, S3 store (SeaweedFS) behind nginx `/media/`, uploader UI; photos scaled to 2000 px in the browser first; 6-hourly orphan sweep; 640 px thumbnails, one `<Picture>`, 60 s catalogue cache | Done (#29, #212, #235) |
| Content-Security-Policy (nonce'd, from the Next 16 proxy), Permissions-Policy, no X-Powered-By, API nosniff; Next.js 16 sitemap + robots | Done (#100, #35) |
| Rate limiting: login / register / refresh per IP (+ failed logins per email and per email + IP); comments, uploads, password, seller writes per user; every `/graphql` request per IP; IPv6 by /64, ≤ 100k keys | Done (#207, #213) |
| Abuse caps: 200 coffees per shop (`LIMIT_REACHED`); empty shops hidden from /shops, /map, sitemap; bcrypt 12 + rehash; 1,000 common passwords refused | Done (#213) |
| Seller work survives session loss: forms stay mounted under an inline sign-in, new-coffee draft in sessionStorage, leave-without-saving prompts | Done (#228) |
| Request limits: list fields priced by their limit, depth ≤ 8, no similar-of-similar, ≤ 5000 tokens, 100 KB body | Done (#207) |
| Hardening: production refuses published secrets and needs `APP_ENV` (#206); safe `?next=` (#208); only nginx reachable, BFF forwards nginx's X-Real-IP (#211); one frontend image for any host (#210) | Done |
| Error contract (`graph/errors.go` ↔ `lib/errors.ts`, Go test); JSON access + panic logs with request id (#48, #53); Postgres pool cap + statement timeout (#52) | Done |
| CI: backend, frontend (incl. lint), compose config, **full stack compose + smoke + browser checks** (Playwright journeys, axe on 13 pages, report → /admin; `e2e/`), `security`, dependabot, actions pinned by SHA. Go 1.27, Node 26, ESLint 10 (#271–#273) | Done (#216, #263–#265) |
| nginx: gzip, no server version, `/media/` sandboxed (GET / HEAD / PUT only), per-IP `limit_req` on /graphql and /api/, timeouts + body caps, exact `/graphql`, JSON access log with request ids | Done (#64, #214) |
| Coffee details (owner, #176): required = name, origin, process, variety, producer, region, altitude, ≥ 1 flavour note, an option; roast optional + 極淺焙 `EXTRA_LIGHT`. API + both forms (Essentials / folded More details) | Done (#181, #182, #190–#192) |
| Header at every width: ☰ · centred wordmark · search icon; everything else in the navigation drawer, `/menu` no-JS fallback | Done (#175, #185) |
| Reference shops (dev only): seed scaffolding, gap report, removal script; roaster lists pending | Scaffolding done (#169); #170–#174 |
| Visual direction: white + black tokens, italic "moni cafe" wordmark (one line; no tagline anywhere, #164, #194), Radix colour tiles, shop initials, site icon | Done (#109–#112, #114, #164) |
| Moderation: suspend users / shops, admin unpublish, audit log, token version per mutation, `cmd/admin` (#224); report comments / shops / coffees, `/admin`, contact details refused in new text (#225) | Done |
| Observability: `/metrics` on an internal port, `/health/live` + `/health/ready`, `/api/health`, Sentry-compatible reporting when `SENTRY_DSN` is set, sweeps awaited + advisory-locked, `docs/DEPLOY.md` | Done (#221) |
| Backups: nightly `age`-encrypted `pg_dump` to S3 or a directory (compose profile `prod`), `restore.sh`, restore drill in CI; Redis / Meilisearch behind profiles | Done (#220, #222) |
| Refresh cookie `__Host-` + Secure and Origin check from `SITE_URL`; CSP `report-to` + `upgrade-insecure-requests` | Done (#215) |
| Text hygiene: control / format characters refused, DB length CHECKs, daily upload budget per shop, paged orphan sweep | Done (#217) |
| **Stage 2 groundwork (#237)**: `money.TWD` refuses fractions / negatives / > NT$10M (#276); `ReserveStock` / `ReleaseStock` + `expectedStock` → `STOCK_CHANGED` on seller edits (#277); `variants.updated_at`, archive instead of delete when referenced (#278, migration 020); River worker with graceful stop + no-op job (#279, migration 021); ECPay test vector still missing (docs unreachable) | Done |
| **Cart (#21, #280)**: `cart_items` (migration 022), `cart` / `addToCart` / `updateCartItem` / `removeFromCart`, price snapshot + "price changed", /cart grouped by shop, Add to cart on the coffee page, drawer link | Done; checkout next |

## Last session

**Session 38**: the owner opened Stage 2 on #197. Shipped #237's groundwork as four slices (#276 TWD scalar, #277 atomic
stock + `STOCK_CHANGED`, #278 `updated_at` / archive-on-reference, #279 River worker) and the cart: API (#21) and UI (#280).
The order-table design for the next slices is in the PR (#237 note) and the Decisions below. ECPay's official CheckMacValue
example couldn't be fetched (proxy blocks developers.ecpay.com.tw), so that test stays skipped.

## Current focus

1. **Orders need #205 answered** (no safe default): one checkout split per shop or one shop per checkout, shipping fee, delivery
   methods, when stock is taken, guest checkout, roast-to-order. Then: `orders` / `order_items` (snapshots, `ON DELETE
   RESTRICT` on variants) / `payments` (unique `merchant_trade_no`) / `payment_events` (idempotent on ECPay's trade number),
   using `ReserveStock` in the order transaction and River for hold expiry. **#12** (commission) and **#201** (legal) gate
   payouts and launch.
2. **Hosting waits on #199** (no safe default): production compose with HTTPS is #219 (blocked). Compose has no `worker`
   service yet; add it with the first real job. Add ECPay's documented CheckMacValue example when the docs are reachable.
3. Blocked `stage-1` slices stay in the queue (owner, #197): #170–#174 (roaster domains), #223 / #226 (#200 / #201).
   Open dependabot majors: TypeScript 7, Postgres 18 (volume dump / restore), Redis 8.
4. Production: `TRUSTED_PROXIES` to the real proxies only; never publish :3000 / :4000 / :9100 (the BFF trusts X-Real-IP);
   `DB_MAX_CONNS` × API instances below Postgres' `max_connections`; choose a map tile provider (#10). The owner should
   turn on secret scanning + push protection and a branch rule on `master` requiring CI (#216; not settable from here).
   Grant the first admin with `cmd/admin grant <email>` so reports reach someone.

Open questions for the owner (answer by commenting on the issue):

| Issue | Question | Default | Safe? |
|---|---|---|---|
| #7 | Image storage | S3-compatible (SeaweedFS in dev) | yes |
| #12 | Commission + payouts (Stage 2) | none | **no** |
| #93 | Seller closes shop / deletes account | manual (contact us) | yes |
| #158 | Shop page curation details | manual order, new at end, archive by stock (built) | yes |
| #199 | Hosting and domain | one VPS running compose + HTTPS | **no** |
| #200 | Email service (password reset, verification) | Resend | **no** |
| #201 | Legal / business basics (company, invoices, returns, terms) | none | **no** |
| #202 | Who may open a shop; removing bad content | live at once + report link | yes |
| #203 | UI tidy-up proposals | 3, 5, 6, 7 | yes |
| #204 | English URLs (/en/…), bilingual seller text | keep cookie, one field | yes |
| #205 | Multi-shop orders, shipping, stock (Stage 2) | one checkout, order per shop | **no** |

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
- **Leaflet + OSM** — no API key for the demo. Owner on #10: keep OSM for the demo and decide before launch.
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
- **CSP with per-request nonces** — no `'unsafe-inline'` scripts; styles keep `'unsafe-inline'` for React/Leaflet.
- **No loading boundaries (#156)** — a `loading.tsx` makes Next stream the page into hidden placeholders that only an
  inline script reveals, so without JavaScript /coffees and /shops showed a skeleton forever. Header and pagination links
  show a pending dot (`useLinkStatus`) instead; a test keeps `loading.*` out of `app/`.
- **Comment pages by offset, not cursor** — simple; "load more" dedupes by id, so a new comment can't show twice.
  The dashboard coffee list pages the same way (#49).
- **Price sort = cheapest available, in-stock variant; sold-out last** — matches the "from NT$…" on cards (#44).
- **Duplicate copies details + options, never photos or comments** — image keys are scoped to the source coffee,
  so sharing them would let the orphan sweep or a later edit of one break the other (#54).
- **Search synonyms = a curated Go table (#269)**: each word ORs its group (≤ 8 patterns, one `ILIKE ANY`), words AND; the
  frontend reads the same expansion from `searchTerms` (#274). **Data export (#270)** = one SQL snapshot of own rows, no secrets.
- **Keyword search = Postgres ILIKE per word (AND), wildcards escaped** — enough for Stage 1's catalogue with no
  new infra; Meilisearch (Stage 3) can replace it behind the same `CoffeeFilter.search` field (#66).
- **`Comment.coffee` is nullable** — a comment can outlive its coffee's publication; non-owners get null rather
  than a draft (#69). `User.comments` is empty, not an error, for other viewers (#71).
- **Logout ends one device; `logoutEverywhere` ends all** — the cookie's refresh token proves the session, so it
  works with an expired access token; revoked tokens leave the rotation chain so a late replay isn't "theft" (#73).
- **Shop search covers name + description, not city** — owner on #50: no city filter, /map shows where shops are (#75).
- **Comment edits are author-only and leave no history** — admins can remove a comment but never rewrite someone's
  words; an "edited" marker is shown instead of keeping old versions (#81). Sellers can't delete comments on their
  coffees: author and admin only (owner, #42).
- **Similar coffees = a SQL score over origin / process / roast / notes, other shops only** — cross-shop discovery
  without new infra; a shared roast alone isn't "similar" (#83).
- **Saved coffees: public count, private list** — the list is self / admin only like "My comments"; drafts drop out of
  it but can still be unsaved; saving a draft is NOT_FOUND, even for its owner (#87).
- **Account deletion deletes comments, refuses shop owners and admins** — personal data goes with the account
  (PDPA); a shop's coffees and links depend on its owner, so seller closure waits on #93 (#90).
- **"Roaster" badge derived from shop ownership, not stored** — `Comment.fromShop` is an `EXISTS` on every read, so
  there is no flag to forge or keep in sync (#95).
- **White + black visual style, no amber or gradients** — the owner's call (2026-11-08) after comparing with SEY /
  La Cabra / Coffee Collective / Poma; the only colour is the soft Radix tile behind a coffee with no photo (#109–#112).
- **Follows: public count, private list** — like saves; nobody (the seller included) sees who follows a shop, and
  owners can't follow themselves, so the count means other people (#102).
- **Provenance as plain columns, altitude in metres, set as a pair** — producer / region are free text (≤ 100) rather than
  curated lists (farms are too many); altitude min alone = one height; updates replace both ends so max ≥ min holds (#116).
- **Brew method and harvest year are listing details, not /coffees filters** — one brew method per coffee (omni = both),
  one harvest year (no future crops) (#122, #129). They show on the coffee page and in JSON-LD. The API keeps
  `brewMethod`, `minHarvestYear`, `minAltitudeM`, `roastLevel` and `flavorNote`, but the site doesn't offer them: the owner
  reversed #127 / #133 / #145 / #146 on #166 because each shop rates these by its own standard. A shared brew method
  still reorders "similar" (#167). The cup profile was removed outright (#176 → #189): sellers describe it in words.
- **Filter options = values with published coffees, counted catalogue-wide; chips are plain links** — hidden, not greyed,
  and the selected one always stays; counts ignore the other filters (no per-combination facet queries); the phone
  toggle is CSS-only (checkbox + label) so nothing depends on hydration (#151–#153).
- **/coffees filters = origin / variety / process / price / in stock (owner, #166; built #167)**: each shop rates cup
  profile, roast and brew by its own standard, so filtering across shops on them misleads. Old links with the removed
  params show the unfiltered list; cards show only the roast. Keyword search and sort stay.
- **Reference roasters' lists come over the network (owner, #168 (a))**: the environment's allow-list gets
  lab19coffee.com, seycoffee.com, pomacoffee.com and onyxcoffeelab.com. Until sessions can reach them, #170–#173 stay
  blocked.
- **Shop pages are the seller's storefront (#158 defaults)**: no buyer controls. The order is the seller's
  (`shop_position`, new coffees at the end, not unique, rewritten as a whole). Sold out = no available option with
  stock, shown in an archive below, and nothing changes on /coffees. Reordering doesn't touch `updated_at` (#160–#163).
- **Reference shops are dev-only seed data, one account each (#169)**: `shops.owner_id` is unique, so each reference shop has
  its own `reference+<slug>@monicacafe.local` account that can't log in. Raw values are matched to our tables (names in
  English or Chinese, or an alias). An unmatched origin or process skips the coffee, and the gap report lists every miss.
  No prices or photos are copied, so the coffees read as sold out.
- **Navigation drawer at every width (owner, #177 (b); built #185)**: the header is ☰ · wordmark (centred) · search on every
  screen, like Lab19; a clean page matters more than one saved click on desktop. The drawer (`lib/navMenu.ts`) holds
  everything, incl. "Open a shop" / "Seller dashboard"; login links carry `?next=`. Without JS the button links to `/menu`.
- **One `Drawer` (modal `<dialog>`) for side panels**: the browser gives focus trapping, Esc and an inert page. A closed
  dialog is shown inline by CSS where the content is a sidebar, so the same markup serves both (#165).
- **Required coffee details (owner's answer on #176; #181, #189–#192)**: name, origin, process, variety (Heirloom /
  Landrace for lots without a cultivar), producer, region, altitude and ≥ 1 flavour note. Roast is optional, with
  `EXTRA_LIGHT` (極淺焙). Edits can change the required details but not clear them; stored coffees are never rewritten.
  Description, brew method and harvest year fold under a native `<details>` (works without JS).
- **Home hero = a small label + intro, no headline or buttons (owner, 2026-11-10, #186)**: the page should look clean. The way
  into the site is the header drawer, which the owner wants at every width (#177 (b), built in #185).
- **The brand is "Moni Cafe" and nothing else (owner, #159 (a))**: 台灣精品咖啡市集 is never displayed, not in the header
  (#164) and not in the home tab title (#194); a test keeps the phrase out of the frontend.
- **Cart lives in Postgres (owner, #9 (a))**: durable across logout and devices, one source of truth with orders. Redis
  stays reserved for caching. **Stage 2 opened while blocked stage-1 slices wait (owner, #197).** Cart lines (#21) hold 1–20
  bags (≤ stock), ≤ 50 lines, a price snapshot refreshed on every write; unbuyable lines stay, flagged, out of the subtotal.
- **Stock is taken by one conditional UPDATE (#277)**; seller edits carry `expectedStock`, so they never undo an order's
  decrement. Options / coffees an order references are **archived, never deleted** (#278, `delete_or_archive_*()`).
- **Listing canonicals keep only `page` (#195)**: filters, sort and search all point at one URL per page, and `?q=` results
  are `noindex, follow`, so crawlers don't index every combination.
- **Production refuses the repo's own secrets (#206)**: anything printed in `.env.example` / compose, or containing `dev-` /
  `change`, is rejected when `APP_ENV=production`, and `APP_ENV` has no default. A test reads both files, so a new secret
  there can't slip past.
- **Request cost = limit × child, priced per SQL query (#207)**: per-parent resolvers add 10 and the similar-coffee scan
  400 (max cost 8000), so one request runs at most ~20 scans. A Go test prices every query in the frontend source at
  page size 100, so pages can't silently outgrow the limit.
- **BFF trusts X-Real-IP, not X-Forwarded-For (#211)**: nginx overwrites X-Real-IP; Next route handlers can't see the
  socket address, so :3000 must never be reachable except through nginx (compose binds it to 127.0.0.1).
- **Migrations: plain SQL + `schema_migrations`, no Go migration library (#209)**: one POSIX script runs in compose, CI and
  `initdb.sh`; each file is one transaction under an advisory lock. Old volumes are refused until `MIGRATE_BASELINE` says
  what they already have, never guessed. Shipped migrations are never edited.
- **Suspension hides, never deletes (#224)**: one SQL fragment (`publicCoffee`) decides what anyone may see, so every list,
  count and lookup drops a suspended shop's coffees the same way; owners and admins still see them. Access tokens carry a
  token version that every **mutation** checks (one primary-key read), so password change, sign out everywhere, theft
  detection and suspension stop writes at once; queries keep the 15-minute window. The audit log is append-only by trigger.
- **Images shrink in the browser, not on the server (#212)**: the API never handles file bytes, so the uploader scales to
  2000 px and re-encodes (PNG → WebP keeps transparency) before signing for the file it actually sends.
- **Failed logins counted per account and per account + address; successes free (#213)**: 50 / 10 min per email across
  all addresses and 10 / 10 min per email + IP (IPv6 by /64), both spent only on a wrong password, so one address can't
  lock the owner out. Shops appear publicly from their first published coffee; a shop holds at most 200 coffees.
- **A session ends only on a 401 (#228)**: network errors, 5xx and 429 on refresh keep the session and retry (2 s, 5 s,
  15 s, then each minute). A form whose session ends stays mounted, disabled, under an inline sign-in. The `mc_s` hint
  cookie (readable, no secret) lets signed-out visitors skip the refresh call (#234).
- **Reports go to `/admin`; contact details refused only in new text (#225)**: one open report per person per target;
  "take down" reuses #224's suspend / unpublish / delete. `ContainsContactInfo` checks comments and descriptions when
  written or changed, never stored rows, so old text can still be saved back unchanged.
- **Thumbnails are derived, never stored (#235)**: `<key>.thumb.webp` sits next to its original, is kept exactly while the
  original is referenced and can't be saved as a URL; cards fall back to the original. Only anonymous catalogue data (filter
  options, home, sitemap) is cached for 60 s; anything carrying a viewer's cookie or IP is not.
