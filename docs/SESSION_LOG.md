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

## Session 29 — 2026-11-09 — Flavour notes required, coffee forms grouped into Essentials + More details
PR: #184

No owner answers on any open question. The reference roasters' domains still don't connect from the session, so
#170–#173 stay `blocked` and #174 waits on them; #21 waits on #9. That left two pickable slices (#181, #182), both
building on #176's safe default. No real gaps turned up that justified new slices, so this session ships two.

### Shipped (one line per slice: area — what — key files)
- #181 cross-cutting — `createCoffee` always, and `updateCoffee` whenever `flavorNotes` is given, refuse an empty or
  all-blank list (`BAD_USER_INPUT`, `field: "flavorNotes"`) via `requireFlavorNotes` (`graph/helpers.go`, table test);
  `flavor_required_integration_test.go` covers omitted / null / empty / blank, and a legacy note-less coffee that
  still edits (without notes) and publishes. Every integration test that created coffees without notes now sends
  one. Frontend: `coffeeDetailsProblem` returns `notesRequired`, `apiDetailsProblem(field, notesSent)` tells it
  apart from too-many / too-long; shared `FlavorNotesField` marks 風味描述 * and shows the message inline
  (`aria-invalid`).
- #182 frontend — both coffee forms show Essentials (name, origin, process, roast, notes; plus options on the new
  form) and fold description, variety, brew method, provenance, harvest year and cup profile into `MoreDetails`
  (native `<details>`, summary "更多細節（已填 N 項）" from `filledOptionalCount`). It opens on an altitude / harvest /
  cup / producer / region problem, and on the edit form when the coffee already has optional details. The unused
  `cf.details` key is gone (the edit form's heading is `cf.essentials`).

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` against a local Postgres **16** (Docker
  Hub answered 429 for `postgres:17`), migrations + seed applied; all 7 demo coffees have notes.
- Frontend: tsc, lint, `npm test` (180), `npm run build`; `docker compose config`; `check_brief.sh`.
- Playwright (API on :4000, `next start` on :3000) at 390 px and 1280 px: empty notes → inline zh message +
  `aria-invalid`; summary counts typed optional fields while folded; an altitude error opens the fold; a coffee
  saves and its edit page opens the fold with "已填 1 項". Screenshots checked: black and white only.
- **Not run:** `docker compose up` + `scripts/smoke.sh` (image pulls rate-limited); CI's `stack` job covers it.

### Decisions / deferred (anything the next session or the owner should know)
- The dashboard edit form asks for a flavour note before saving any change, even on a coffee saved before #181
  (the API itself still accepts edits that leave notes alone). The demo seed has no such coffees.
- #176 stays open (its defaults are built: points 1, 3, 4, 5; point 2, blends, is deferred to a later slice).

## Session 28 — 2026-11-09 — /coffees filters trimmed, navigation drawer, no-JS list pages, reference-shop scaffolding
PR: #183

No new owner answers since Session 27 (all open questions were last updated before it). The reference roasters'
domains still answer `CONNECT tunnel failed, response 403`, so #170–#173 stay `blocked` and #174 (depends on them)
waits. Took the two p1 slices (#167, #175) and the two unblocked p2 slices (#156, #169). Probing /coffees with
junk URLs found two error-page bugs, opened and fixed as #179 and #180.

### Shipped (one line per slice: area — what — key files)
- #167 cross-cutting — /coffees keeps search, sort, origin, variety, process, price and in stock; roast / brew /
  flavour / harvest / cup-profile / altitude fields, parsers, chip kinds, constants and strings removed, old params
  ignored; cards show only the roast; `CARD_FIELDS` drops `brewMethod`; `SimilarCoffees` no longer adds a point for
  a close acidity; schema comment on `CoffeeFilter`; smoke page checks replaced (`FilterSidebar.tsx`,
  `FilterChips.tsx`, `lib/coffeeQuery.ts`, `lib/coffeeFilters.ts`, `lib/filterChips.ts`, `internal/store/coffees.go`)
- #175 frontend — below `lg` the header is one row (menu button, wordmark, search icon); the menu opens the shared
  `Drawer` (now 85vw / max 24rem, 24rem from `sm`) with a two-level menu from `lib/navMenu.ts` (signed out / buyer /
  seller / admin) and the language switch; no-JS fallback `/menu` (noindex); search icon is a `<details>` panel
  (`components/NavDrawer.tsx`, `NavMenuList.tsx`, `SearchToggle.tsx`, `SiteHeader.tsx`, `app/menu/page.tsx`)
- #156 frontend — the `(list)` route groups and their `loading.tsx` / `ListSkeleton` are gone, so /coffees and /shops
  are complete HTML without JavaScript; header and pagination links show a pending dot (`useLinkStatus`,
  `components/LinkPending.tsx`); a test keeps `loading.*` out of `app/`
- #169 cross-cutting — `scripts/seed_reference.sql` (staging tables, aliases, matching functions, `reference_load()`,
  `reference_gaps` view; applied by `initdb.sh` when `SEED_REFERENCE_SHOPS=true`), `reference_gaps.sh` (`--strict`),
  `remove_reference_shops.sql`, `reference_selftest.sql`; CI backend job seeds / self-tests / removes, stack job runs
  with the flag on and prints the gap report
- #179 frontend — malformed `?origin` / `?variety` / `?process` ids are dropped instead of erroring (`parseIdParam`)
- #180 frontend — a backwards price range is swapped instead of erroring (`priceRange`)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test ./...`, and `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16
  (migrations 001–014 + seed). `TestSimilarCoffees` now expects the close-acidity coffee below the same-brew one.
- Frontend: tsc, lint, `npm test` (178 pass), `npm run build`. `check_brief.sh` and `docker compose config` pass.
- Reference seed on a scratch database: loads with an empty catalogue, re-runs cleanly, the self-test passes
  (3 of 5 fixtures inserted, 3 gap rows, `--strict` exits 1), and removal leaves the 7 demo coffees and 3 shops.
- Smoke against Go API :4000 + `next start` :3000 on a fresh DB: everything passes except the two `/media/` checks (no
  nginx / SeaweedFS; Docker isn't available here). CI's compose job covers those and runs the stack with
  `SEED_REFERENCE_SHOPS=true` for the first time.
- Playwright (Chromium): drawer at 390 px (332 px wide) and 820 px (384 px): opens, `aria-expanded`, scroll lock, Esc /
  backdrop / link close it, focus returns to the button; search icon focuses the field and closes after a search;
  no menu button at 1280 px. Signed in: Saved / Following / Settings / Log out, and logging out from the drawer
  switches it back to Log in / Register. JS off: header links to /menu, /coffees and /shops show their content, the
  /coffees phone filter toggle unfolds the form. Screenshots looked at, not attached to the PR (no image upload
  from this environment).
- **Not verified:** the seller "Seller dashboard" entry in a real session (covered by the `navMenu` unit test only);
  the CI stack's initdb with the reference flag (runs for the first time in this PR's CI).

### Decisions / deferred (anything the next session or the owner should know)
- #169: `shops.owner_id` is unique, so each reference shop has its own `reference+<slug>@monicacafe.local` account
  (disabled password) rather than one shared user (commented on #169). Reference coffees have no options (no prices
  copied), so they read as sold out. Once #170–#173 add rows, newest-first lists put them ahead of the demo coffees,
  and smoke checks that expect demo coffees on /coffees page 1 may need narrowing.
- #175 built on #177's safe default (drawer below `lg` only); the question stays open. The drawer shows "Seller
  dashboard" only to accounts with a shop; "Open a shop" stays in the lg+ account menu and on /account.
- #156: no loading skeletons anywhere now; the brief's decision is rewritten.
- Next: #181 (≥ 1 flavour note required) and #182 (dashboard form "Essentials" / "More details"), opened from #176's
  safe default. #174 and #170–#173 wait on network access to the roasters' sites (#168).

## Session 27 — 2026-11-09 — Seller-curated shop pages, sold-out archive, wordmark, /coffees filter drawer
PR: #178

Owner answers since Session 26: #166 (filters on /coffees: keep origin / variety / process / price / in stock; drop
the brew method from cards; the work is #167) and #168 ((a): allow the four reference roasters' domains in the
environment's network settings). Both were recorded in the brief and closed. The domains still returned
`CONNECT tunnel failed, response 403` from this session's proxy, so #170–#173 stay `blocked` (commented on #168).
Took the six lowest-numbered p1 slices (#160–#165), which build on each other: shop page → order API → dashboard
order → archive. They build on the safe defaults of #158 and #159.

### Shipped (one line per slice: area — what — key files)
- #160 frontend — shop page has no buyer search / filters / sort / chips; old `?q`, `?roast`, `?sort` … links show the
  whole lineup; `ShopCoffeesForm`, `shopCoffeesHref`, `shopCoffeeFilter` and their tests and strings removed; smoke
  swaps the shop-filter checks for "old params ignored, no form" (`app/shops/[slug]/page.tsx`)
- #161 backend — migration 014 `coffees.shop_position` (backfilled newest first; a BEFORE INSERT trigger appends new,
  duplicated and seeded coffees; the `updated_at` trigger skips position-only updates so sitemap lastmod doesn't
  move); `Mutation.reorderShopCoffees(shopId, coffeeIds)` (owner / admin, exact set incl. drafts, one transaction with
  rows locked); `CoffeeSort.SHOP_ORDER`, the default for `Shop.coffees` (`store/coffees.go`, `graph/helpers.go`
  `checkLineup`, `graph/shop_order_integration_test.go`)
- #162 frontend — dashboard rows get ↑ / ↓ buttons (labelled with the coffee name), optimistic with rollback and an
  error line; a note says this is the buyers' order; reordering needs every coffee loaded (`moveItem`, `canReorder`
  in `lib/dashboard/coffeePages.ts`)
- #163 cross-cutting — `CoffeeFilter.inStock: false` = only sold out (store `SoldOut`); shop page shows the lineup
  (`?page`) and "已售完 · 封存 / Sold out · Archive" (`?archive`, own pagination, `#archive` anchor, greyscale, hidden
  when empty); seed adds a sold-out 晨光 coffee (207, dated last season); smoke checks it sits under the archive
  heading (`lib/shopQuery.ts` `parseShopPagePages` / `shopPageHref`, `Pagination` `hrefFor`)
- #164 frontend — header wordmark without the tagline (#159 default (a)); "moni cafe" on one line, both words the same
  size; `sub` prop and the unused `brand.tagline` string removed (`components/Wordmark.tsx`, `tests/brand.test.mjs`)
- #165 frontend — /coffees sidebar from `md` (15rem, 18rem from `lg`); below `md` the "Filters (N)" button opens a
  shared `components/Drawer.tsx` (modal `<dialog>`, 85vw / max 22rem, black/40 backdrop, Esc / backdrop / close
  button, scroll lock, closes when widened to md); no-JS keeps the CSS toggle (`components/coffees/FilterPanel.tsx`,
  `lib/drawer.ts`)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test ./...`, and `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16
  (migrations 001–014 + seed). New: `TestCheckLineup`, `SHOP_ORDER` in `TestStoreSort` / `TestCoffeeSortOrderBy`,
  sold-out cases in `TestCoffeeFilterWhere` / storeFilter, `TestReorderShopCoffees` (auth, validation, draft
  visibility, `updatedAt` unchanged, create + duplicate append), `TestShopArchiveFilter`; `TestShopCoffeesSort`'s
  default case now expects shop order.
- Frontend: tsc, lint, `npm test` (178 pass), `npm run build`. `check_brief.sh` passes.
- Smoke against Go API :4000 + `next start` :3000 on a fresh DB: 53 ok; only the two `/media/` checks fail (no nginx /
  SeaweedFS locally; Docker isn't available here). CI's compose job covers those.
- Playwright (Chromium): the drawer at 390 px (opens at 332 px wide, Esc / backdrop / close button close it, focus goes
  back to the button, scroll lock is set and restored, Apply submits); no toggle at 820 / 960 / 1280 (sidebar). Dashboard
  reorder by mouse and keyboard persists across a reload. Shop page at 390 / 1280 shows the archive greyed out under
  its heading. Screenshots looked at, not attached.
- **Not verified:** the no-JS fallback of the /coffees toggle. Without JS, /coffees renders nothing because of #156
  (the loading boundary), so it can't be seen until that's fixed. On phones the header still wraps to two rows (91 px).
  #175 (navigation drawer) replaces that row.

### Decisions / deferred (anything the next session or the owner should know)
- Built on the safe defaults of #158 (manual order, new coffees at the end, archive by stock, /coffees unchanged) and
  #159 (a) (no tagline). Both questions stay open for the owner.
- Shop positions aren't unique: the reorder rewrites them all at once, and ties (only from concurrent inserts) fall
  back to newest first. Reordering leaves `updated_at` alone.
- `Query.coffees` accepts `SHOP_ORDER` too, but across shops it only interleaves positions. The site uses it only on
  shop pages.
- The dashboard reorder needs every coffee loaded (50 per page). Sellers with more than 50 click "load more" first.
- Next p1 work: #167 (remove the dropped /coffees filters and the brew tag on cards) and #175 (navigation drawer,
  reusing `Drawer`). Then p2: #156, #169, #174.

## Session 26 — 2026-11-09 — Filter options with coffees, active-filter chips, phone filter toggle
PR: #157

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps in browsing: the /coffees sidebar listed every curated origin, variety and
process (most with no coffees, so picking one gave an empty page), and on phones the ~15-control form sat above
the results with nothing showing which filters were narrowing the list.

### Shipped (one line per slice: area — what — key files)
- #150 backend — `coffeeCount: Int!` on `OriginCountry`, `CoffeeVariety`, `ProcessingMethod` (published coffees only):
  one `GROUPING SETS` query per request via a new `onceLoader` on the request-scoped Loaders; resolvers forced in
  `gqlgen.yml` (`store.PublishedCoffeeCountsByReference`, `graph/loaders.go`)
- #151 frontend — /coffees sidebar uses `BROWSE_FILTER_OPTIONS` (with counts) and lists only values with coffees plus
  whatever the URL selects, as "Ethiopia (3)"; empty region optgroups go; dashboard forms keep the full lists
  (`lib/filterOptions.ts`)
- #152 frontend — removable chips above /coffees results, one per active filter (price = one chip), each a plain link
  without that filter (page reset, search + sort kept); "Clear all" for 2+ (`lib/filterChips.ts`,
  `components/coffees/FilterChips.tsx`)
- #153 frontend — below `lg` the filter form folds behind a "Filters (N)" toggle (visually hidden checkbox + label,
  pure CSS); N = `activeFilterCount()` (`components/coffees/FilterPanel.tsx`)
- #154 frontend — the same chips on shop pages; the page's filter builder moved to `shopCoffeeFilter()` in
  `lib/coffeeQuery.ts` so it's tested
- #155 cross-cutting — smoke: `coffeeCount` (Ethiopia ≥ 1, Rwanda 0), Rwanda absent from the /coffees origin select,
  chips + "Filters (2)" on /coffees, chips on a shop page

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test ./...`, and `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16
  (migrations + seed). New: `TestAddReferenceCount`, `TestOnceLoader` (concurrent callers, shared error),
  `TestReferenceCoffeeCount` (published vs draft, a coffee without variety, anon + owner).
- Frontend: tsc, lint, `npm test` (172; new `filterOptions.test.mjs`, `filterChips.test.mjs`), `next build`;
  `docker compose config`, `check_brief.sh`.
- API binary + `next start` on a fresh seeded DB: `scripts/smoke.sh` all ok incl. the four new checks, except
  `/media/` (no nginx / SeaweedFS here). Playwright: desktop sidebar + chips, iPhone 13 collapsed / opened toggle,
  shop page chips. Not run: `docker compose up` (no Docker daemon; CI's stack job covers it).

### Decisions / deferred (anything the next session or the owner should know)
- Options with no published coffees are hidden rather than greyed out; the selected one always stays. Counts are
  catalogue-wide, not narrowed by the other active filters (true facets would need a query per filter combination).
- The phone toggle is a checkbox + label, not `<details>`: Chromium kept a closed `<details>`' content at zero height
  on desktop even with `::details-content { content-visibility: visible }`, and this needs no JavaScript.
- Found, not fixed: /coffees doesn't render without JavaScript, because its `(list)` loading boundary streams the
  results inside a hidden Suspense placeholder. Pre-existing; filed as #156.
- No new owner questions.

## Session 25 — 2026-11-09 — Sweet, body and high-grown filters
PR: #149

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no new owner answers on any question), so
the six below were filed from gaps next to last session's work: the cup profile (#136) stored sweetness and body
but only acidity could be filtered, altitude (#116) was shown everywhere but never filterable, and an empty
/coffees result only offered "clear search" even when a filter emptied it.

### Shipped (one line per slice: area — what — key files)
- #143 backend — `CoffeeFilter.minSweetness`, `minBody`, `maxBody` (1–5) on `Query.coffees` and `Shop.coffees`; unset
  scales never match; `minBody > maxBody` is BAD_USER_INPUT on `minBody`; the cup checks (incl. `maxAcidity`) share one
  loop in `storeFilter` (`graph/helpers.go`, `store.CoffeeFilter.where`)
- #144 backend — `CoffeeFilter.minAltitudeM` (0–6000): `COALESCE(altitude_max_m, altitude_min_m) >= $n`, i.e. judged by
  the top of the range or the single height; no altitude never matches
- #145 frontend — "Sweet (sweetness 4–5)" checkbox (`?sweet=high`) and a body select (`?body=light|full` → ≤ 2 / ≥ 4) in
  the /coffees sidebar and the shop page's filters; `cupFilter()` maps all cup choices for both pages; the shop page now
  hands its cached loader one JSON filter key instead of a growing positional list (`lib/coffeeQuery.ts`,
  `app/shops/[slug]/page.tsx`, `FilterSidebar.tsx`, `ShopSortForm.tsx`)
- #146 frontend — "High-grown (1,500 m+)" checkbox, `?altitude=high` → `minAltitudeM: 1500` (`HIGH_GROWN_MIN_M`), on
  both pages; `shopCoffeesHref` keeps it
- #148 frontend — empty /coffees result offers "Clear filters" (keeps search + sort) whenever a non-search filter is set,
  next to "Clear search" (`hasFiltersBesidesSearch`, `clearFiltersHref`). Shop pages already had "Clear search and filters"
- #147 cross-cutting — seed: the espresso blend grows at 1,000–1,400 m so ?altitude=high has something to exclude; smoke
  checks the four GraphQL filters against seeded ids, /coffees?altitude=high&body=light, an empty
  /coffees?q=dawn&sweet=high&body=full with "Clear filters", and /shops/demo-roastery?sweet=high

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test ./...`, and `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16
  (migrations 001–013 + seed). New: `TestStoreFilter` sweetness / body / altitude cases, two `where()` cases,
  `TestCoffeesSweetnessBodyFilter` and `TestCoffeesAltitudeFilter` (Query + Shop, anon + owner with drafts, bad input).
- Frontend: tsc, lint, `npm test` (163; new parser / `cupFilter` / clear-filters cases in `coffeeQuery.test.mjs`),
  `next build`; `docker compose config`, `check_brief.sh`.
- API binary + `next start` on a fresh DB: `scripts/smoke.sh` all ok (incl. the four new checks) except the two `/media/`
  checks (no SeaweedFS / nginx here). Playwright screenshots: sidebar with all new filters checked (desktop), shop page
  filters + "no matches" state, mobile empty state with both clear links. Not run: `docker compose up` (no Docker daemon
  here; CI's stack job covers it).

### Decisions / deferred (anything the next session or the owner should know)
- "Sweet" = sweetness 4–5, "light body" = 1–2, "full body" = 4–5: the outer two steps, mirroring "low acidity" = 1–2.
- "High-grown" = 1,500 m+, judged by the top of the coffee's altitude range (a 1,200–1,800 m lot counts). One
  checkbox rather than a numeric field keeps the sidebar short; the API takes any height for later UI.
- No new owner questions.

## Session 24 — 2026-11-08 — Cup profile (酸度 / 甜度 / 醇厚度)
PR: #142

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from a gap: Taiwan roasters print acidity / sweetness / body scales on bags and menus,
and "低酸" (low acidity) is one of the most common ways buyers here shop for coffee, but a coffee could only say
so in its description. Roast level is a proxy, not the same thing.

### Shipped (one line per slice: area — what — key files)
- #136 backend — migration 013: `coffees.acidity / sweetness / body` (SMALLINT, NULL = not given, CHECK 1–5);
  `Coffee.acidity / sweetness / body`; create / update take `CupProfileInput` which sets the three as a group (an
  omitted scale becomes null, an empty input is BAD_USER_INPUT on `cupProfile`); `clearCupProfile` removes them;
  `duplicateCoffee` copies them (`cupProfileParam` in `graph/helpers.go`, `store.CupProfile`)
- #137 backend — `CoffeeFilter.maxAcidity` (1–5) on `Query.coffees` and `Shop.coffees`; unset never matches
  (`storeFilter`, `CoffeeFilter.MaxAcidity` → `acidity <= $n`, partial index `idx_coffees_acidity`)
- #138 frontend — dashboard new + edit forms: "Cup profile" fieldset with three 1–5 selects (blank = not given);
  `coffeeDetailsPatch` sends all three as `cupProfile` or `clearCupProfile`; API cup errors get their own message
  (`CupProfileFields.tsx`, `parseCupValue` / `cupProfileFromForm` in `lib/dashboard/validate.ts`, `lib/cupProfile.ts`)
- #139 frontend — coffee page + draft preview: five black/white steps per set scale, `role="img"` labels
  ("Acidity 2 of 5" / "酸度 2 / 5"); Product JSON-LD PropertyValues with minValue 1 / maxValue 5
  (`components/coffees/CupProfile.tsx`, `lib/seo.ts`)
- #140 frontend — `?acidity=low` → `maxAcidity: 2` (`parseAcidityParam`, `LOW_ACIDITY_MAX`): "Low acidity (1–2 of 5)"
  checkbox in the /coffees sidebar and the shop page's in-shop filters, kept by `shopCoffeesHref`
- #141 cross-cutting — demo seed gives five coffees a profile (Huila + blend low acid, Antigua unset); smoke checks the
  GraphQL filter, /coffees?acidity=low and the coffee page's scale; "similar coffees" adds +1 to the ordering for an
  acidity within one step (like the brew method: it never qualifies a coffee alone)

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations
  001–013 + seed). New: `TestCupProfileParam`, `TestStoreFilter` maxAcidity cases, a `where()` case,
  `TestCoffeeCupProfile`, `TestCoffeesAcidityFilter` (Query + Shop, anon + owner with drafts), two new rows in
  `TestSimilarCoffees`.
- Frontend: tsc, lint, `npm test` (157; new `tests/cupProfile.test.mjs`, cup cases in dashboard / coffeeQuery tests),
  `next build`; `docker compose config`, `check_brief.sh`.
- API binary + `next start` on a fresh DB: `scripts/smoke.sh` all ok (incl. the three new cup checks) except the two
  `/media/` checks (no SeaweedFS / nginx here). Playwright (en): sidebar "Low acidity" → 203, 206; shop page
  `?acidity=low` keeps the box checked; coffee page scales + JSON-LD; seller registers, opens a shop, creates a coffee
  with acidity 2 / body 5 → edit form shows it → blanking both saves null → sweetness 4 survives a reload and shows in
  the draft preview; no page errors. Not run: `docker compose up` (CI's stack job covers it).

### Decisions / deferred (anything the next session or the owner should know)
- Three 1–5 scales, set as a group (like altitude): that's how bags and menus print them, and a group avoids a
  per-field null/absent ambiguity in GraphQL. An empty `CupProfileInput` is an error rather than a silent clear.
- "Low acidity" = 1–2. Cards don't show the profile (they already carry roast + brew method); the coffee page does.
- Not done: a sweetness / body filter, or sorting by acidity — file them if buyers ask.

## Session 23 — 2026-11-08 — Harvest year (產季)
PR: #135

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from a gap: Taiwan specialty roasters print the crop on every bag ("2025 產季") and buyers
check it for freshness — green coffee fades, so an old crop is a different coffee — but a coffee couldn't say it
anywhere except its description.

### Shipped (one line per slice: area — what — key files)
- #129 backend — migration 012: `coffees.harvest_year` (INTEGER, NULL = not given, CHECK 2000–2100); `Coffee.harvestYear`;
  create / update inputs accept 2000 through the current year in Asia/Taipei (`clearHarvestYear` removes it, can't be
  combined with a value); `duplicateCoffee` copies it (`validateHarvestYear` in `graph/helpers.go`)
- #130 backend — `CoffeeFilter.minHarvestYear` on `Query.coffees` and `Shop.coffees`: that year or later, unset never
  matches, outside 2000–2100 is BAD_USER_INPUT (`storeFilter`, `CoffeeFilter.MinHarvestYear` → `harvest_year >= $n`)
- #131 frontend — dashboard new + edit forms: optional "Harvest year" in the provenance fieldset; `parseHarvestYear` /
  `taipeiYear` mirror the API; `coffeeDetailsPatch` sends `harvestYear` or `clearHarvestYear`; its own error message
  (`lib/dashboard/validate.ts`, `ProvenanceFields.tsx`)
- #132 frontend — coffee page + draft preview list 產季 / Harvest ("2025 產季" / "2025 harvest"); Product JSON-LD
  "Harvest year" PropertyValue (`lib/harvest.ts`, `CoffeeDetailView.tsx`, `lib/seo.ts`)
- #133 frontend — `?harvest=recent` → `minHarvestYear` = last year in Taipei (`parseHarvestParam`, `recentHarvestFrom`):
  checkbox "Recent harvest (YYYY or later)" in the /coffees sidebar and the shop page's in-shop filters, kept by
  `shopCoffeesHref`
- #134 cross-cutting — demo seed dates five crops relative to the current Taipei year (Huila two years back, the blend
  unset); keyword search matches the harvest year; smoke checks the GraphQL filter and /coffees?harvest=recent

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations
  001–012 + seed). New: `TestValidateHarvestYear` (incl. Taipei new year), `TestStoreFilter` harvest cases, a `where()`
  case, `TestCoffeeHarvestYear`, `TestCoffeesHarvestYearFilter` (Query + Shop, anon + owner with drafts), a harvest
  case in `TestCoffeeSearch`.
- Frontend: tsc, lint, `npm test` (149; new `tests/harvest.test.mjs`, harvest cases in dashboard / coffeeQuery tests),
  `next build`; `docker compose config`, `check_brief.sh`.
- API binary + `next start` on a fresh DB: `scripts/smoke.sh` all ok (incl. the two new harvest checks) except the two
  `/media/` checks (no SeaweedFS / nginx here). Playwright (en): sidebar "Recent harvest" → 201, 202, 204, 205 (not the
  older Huila or the unset blend); coffee page fact + JSON-LD; seller registers, opens a shop, a future year is refused,
  creates a 2025 coffee → edit form shows it → clearing saves null → 2024 survives a reload; no page errors.
  Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- One harvest year per coffee (the year the harvest ended), not a "2024/25" range: that's what the bag label says and
  what a filter can compare. Future years are refused by the API (Taipei calendar); the DB CHECK is a wide 2000–2100.
- "Recent harvest" = this year's and last year's crops: green coffee ships for a year or more after harvest, so last
  year's crop is still the current one for many origins. A filter with an unknown year (`minHarvestYear` 2027 today) is
  an empty list, not an error.
- Cards don't show the harvest year (their pill already carries roast + brew method); the coffee page does.

## Session 22 — 2026-11-08 — Brew method: filter, espresso or omni
PR: #128

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from a gap: specialty roasters label every bag 手沖 / 義式 / 全方位 (filter / espresso /
omni) and buyers shop by it, but a coffee could only say so in its description. Roast level isn't the same thing.

### Shipped (one line per slice: area — what — key files)
- #122 backend — migration 011: `coffees.brew_method` (FILTER | ESPRESSO | OMNI, NULL = not given, CHECK);
  `enum BrewMethod`, `Coffee.brewMethod`; create / update inputs (`clearBrewMethod` removes it, can't be combined
  with a value); `duplicateCoffee` copies it (`brewMethodParam`, `toBrewMethod` in `graph/helpers.go`)
- #123 backend — `CoffeeFilter.brewMethod` on `Query.coffees` and `Shop.coffees`: FILTER / ESPRESSO also match OMNI,
  OMNI matches only OMNI, unset never matches (`brewMethodsMatching`, `CoffeeFilter.BrewMethods` → `= ANY($n)`)
- #124 frontend — dashboard new + edit forms: optional "Roasted for" select; `coffeeDetailsPatch` sends `brewMethod`
  or `clearBrewMethod` (`lib/dashboard/validate.ts`, `brewOptions` in `CoffeeDetailsForm.tsx`)
- #125 frontend — coffee page + draft preview list 適合沖煮 / Roasted for (omni spelled out as "filter and
  espresso"); Product JSON-LD "Roasted for" PropertyValue; card pills read "淺焙 · 手沖" (`lib/brew.ts`)
- #126 frontend — `?brew=filter|espresso|omni` (`parseBrewParam`, `brewParam`): radio group + hint in the /coffees
  sidebar, select in the shop page's in-shop filters, kept by `shopCoffeesHref`
- #127 cross-cutting — demo seed gives five coffees a brew method (Antigua unset); smoke checks the ESPRESSO filter in
  GraphQL and /coffees?brew=espresso; `Coffee.similar` adds 1 for the same brew method, only to order coffees that
  already pass the minimum score

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations
  001–011 + seed). New: `TestBrewMethodParam`, `TestBrewMethodsMatching`, a `where()` case, `TestCoffeeBrewMethod`,
  `TestCoffeesBrewMethodFilter` (Query + Shop, anon + owner with drafts); `TestSimilarCoffees` gained brew cases.
- Frontend: tsc, lint, `npm test` (142; new `tests/brew.test.mjs`, brew cases in dashboard / coffeeQuery tests),
  `next build`; `docker compose config`, `check_brief.sh`.
- API binary + `next start` on a fresh DB: `scripts/smoke.sh` all ok (incl. the two new brew checks) except the two
  `/media/` checks (no SeaweedFS / nginx here). Playwright (en): card pills, sidebar Espresso → 2 coffees, coffee
  page fact + JSON-LD, shop page `?brew=filter`; seller creates an espresso coffee → edit form shows it → clearing
  saves null → OMNI survives a reload → draft preview lists it; no page errors. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- One brew method per coffee, not a set: "omni" covers coffees roasted for both, which is how roasters label them.
- Asking for filter or espresso also lists omni roasts; asking for omni lists only omni.
- Keyword search doesn't match the brew method (a coffee's own text still matches, e.g. "義式配方"); buyers use the
  `?brew=` filter instead.

## Session 21 — 2026-11-08 — Coffee provenance: producer, region, growing altitude
PR: #121

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the five below were filed from a gap in the product: a specialty buyer's first questions — which farm or washing
station, which region, how high — had nowhere to go but the free-text description; a coffee knew only its country.

### Shipped (one line per slice: area — what — key files)
- #116 backend — migration 010: `producer` / `region` (TEXT, '' = not given, ≤ 100) and `altitude_min_m` /
  `altitude_max_m` (0–6000, max needs a min and is ≥ it) with CHECKs; `Coffee.producer / region / altitudeMinM /
  altitudeMaxM`; create / update inputs (update sets both altitude ends together, `clearAltitude` removes them);
  `duplicateCoffee` copies them (`validateAltitude`, `cleanProvenance` in `graph/helpers.go`)
- #117 frontend — dashboard new + edit forms: `ProvenanceFields` (producer, region, lowest / highest altitude);
  `parseAltitude` mirrors the API ("1,800" accepted), `coffeeDetailsPatch` sends changes / `clearAltitude`,
  `apiDetailsProblem` maps API fields to messages (`lib/dashboard/validate.ts`)
- #118 frontend — coffee page (and the draft preview) lists 生產者 / 產區 / 海拔 when set; Product JSON-LD gets
  `additionalProperty` PropertyValues (`lib/provenance.ts`: `formatAltitude`, `provenanceFacts`)
- #119 frontend — cards show "Producer · Region" under the name; the colour tile writes "Region · Country"
  (`originLine`); every card query fetches producer / region via `CARD_FIELDS`
- #120 cross-cutting — keyword search also matches producer and region; the demo seed gives five coffees provenance;
  smoke finds the seeded Yirgacheffe by "gedeo" with its altitude; search hint mentions farms

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations
  001–010 + seed). New: `TestValidateAltitude`, `TestCleanProvenance`, `TestCoffeeProvenance` (create / update / clear /
  validation / duplicate), provenance cases in `TestCoffeeSearch`. The DB CHECK was confirmed to refuse a max without a min.
- Frontend: tsc, lint, `npm test` (138), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + `next start` locally on a fresh DB: `scripts/smoke.sh` all ok (incl. the new provenance search) except
  the two `/media/` checks (no SeaweedFS / nginx here). Playwright (en): coffee page facts + JSON-LD, cards on /coffees;
  register → open shop → new coffee with producer / region / "1,900"–1500 (altitude error shown) → –2100 saves → edit
  form shows the values → clearing region + altitude saves and survives a reload → draft preview lists the producer;
  no page errors. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- Altitude is metres only (what Taiwan roasters print); a single height is stored as the lowest with no highest.
- The API sets both altitude ends together on update, so a half-edited range can't leave max < min.
- No filter by region / altitude yet: search covers region words; a range filter can come if buyers ask.

## Session 20 — 2026-11-08 — White + black visual direction, wordmark, colour tiles, site icon
PR: #115

The owner filed a new visual direction (#109–#112, after comparing with SEY / La Cabra / Coffee Collective / Poma);
all four were taken, plus one gap found while doing them (no site icon: every page load 404'd on /favicon.ico).

### Shipped (one line per slice: area — what — key files)
- #109 frontend — white page + black type: palette tokens `ink / paper / muted / line` in `globals.css` (`@theme`),
  every amber accent → black / neutral, stone → neutral, the dark home hero → white with black buttons, gradients
  gone, black map pins, visible black focus outline, `label-caps` for SEY-style small uppercase labels; a follow-up
  commit also turned the rose "saved" pill and emerald "published" / success colours black / grey.
  `tests/palette.test.mjs` allows only neutral, black / white tokens and error red in `app/` + `components/`.
- #110 frontend — `Wordmark`: heavy italic lowercase "moni" (Inter Tight 800 italic via `next/font`) with "cafe"
  under its right edge, in header (tagline beside "cafe" from `sm`) and footer; `lib/brand.ts` (`BRAND_NAME`,
  `pageTitle`); "MONI CAFE" → "Moni Cafe" in metadata / OG / copy.
- #111 frontend — `lib/coffeeTile.ts`: Radix light scales steps 4–8 (17 hues, copied from @radix-ui/colors 3.0.0, MIT,
  attributed), `coffeeTile(id)` (FNV-1a, deterministic), `tileLines()`; `CoffeeTile` on cards, the detail image,
  /account saved thumbnails and new dashboard row thumbnails (dashboard query now fetches `imageUrls`).
- #112 frontend — `lib/shopInitials.ts` + `ShopLogo` (black-outlined circle with initials) on shop cards, shop page,
  seller box, followed shops; no banner → no band at all; last emoji decorations removed (404 shows an italic "404",
  home "why" cards numbered 01–03).
- #114 cross-cutting — `app/icon.svg` (italic "m" drawn as a path), `favicon.ico` (16/32/48 RGBA) and
  `apple-icon.png` (180 px); CSP proxy matcher skips them; `smoke.sh` checks all three.

### Verification (what ran and passed; what was NOT tested and why)
- Frontend: tsc, lint, `npm test` (132), `next build`; `docker compose config`, `check_brief.sh`.
- Backend (unchanged): gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16
  (migrations 001–009 + seed).
- API binary + `next start` locally: `scripts/smoke.sh` all ok (incl. the new icon checks) except the two `/media/`
  checks (no SeaweedFS / nginx here). Playwright screenshots (desktop + 390 px phone) of home, /coffees, a coffee page,
  /shops, a shop page and the 404 checked by eye. Not run: `docker compose up`; dashboard and /account were not
  screenshotted signed in (type-checked and unit-tested only).

### Decisions / deferred (anything the next session or the owner should know)
- Radix hex values are copied into `lib/coffeeTile.ts` (with the MIT notice) rather than adding `@radix-ui/colors`
  as a dependency — 85 constants, no runtime cost.
- Tile colour comes from the coffee id, so it never changes when a coffee is renamed; 17 hues × 5 steps.
- List thumbnails (/account, dashboard) show the tile colour only — words don't fit at 48–56 px.
- Error red is the one semantic colour kept; the published / draft badge is now filled black vs outlined grey.

## Session 19 — 2026-11-07 — Follow roasters: follows, following feed, most-followed shops
PR: #108

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from a gap in the product: the brief calls Moni Cafe a "Shop app for roasters", yet a buyer
could save a coffee but had no way to keep track of a roaster, and sellers had no audience signal for their shop.

### Shipped (one line per slice: area — what — key files)
- #102 backend — migration 009 `shop_follows` (UUID id, unique per user + shop, both sides cascade);
  `followShop` (own shop → BAD_USER_INPUT, unknown → NOT_FOUND) / `unfollowShop` (null when the shop is gone), both
  idempotent, `SaveUser` rate-limit bucket; `Shop.isFollowed` + `followerCount` via request-scoped loaders (the
  viewer-flag loader is now shared with `Coffee.isSaved`: `viewerFlagLoader`); `User.followedShops` (self / admin
  only) (`store/follows.go`)
- #103 frontend — `FollowButton` on shop pages: login link signed out, count only for the shop's owner, optimistic
  toggle with rollback (`followControl`, `toggleFollow`, `settleFollow` in `lib/follows.ts`)
- #104 frontend — /account "追蹤的店家 / Shops you follow": logo, city, coffee count, Unfollow, load more
  (`FollowedShops`; reuses the generic list helpers in `lib/saved.ts`)
- #105 backend — `Query.followingCoffees(limit, offset)`: published coffees from followed shops, newest first,
  UNAUTHENTICATED when signed out (`store.FollowingCoffees`)
- #106 frontend — home page "你追蹤的烘豆師 / From roasters you follow": client-side section, hidden when signed out,
  on error or when empty (`FollowingFeed`, `showFollowingFeed`)
- #107 cross-cutting — `ShopSort.MOST_FOLLOWED` (store + GraphQL, ties newest first), `?sort=followers` "最多追蹤 /
  Most followed" on /shops, "N 人追蹤 / Followed by N" on shop cards, "N followers" on the dashboard header
  (`followerPart`); the demo seed adds three follows and smoke checks the order

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations 001–009
  + seed). New: `TestShopFollows`, `TestFollowingCoffees` (store + GraphQL), `TestFollowShops`, MOST_FOLLOWED in
  `TestListShopsSort` / `TestStoreShopSort`.
- Frontend: tsc, lint, `npm test` (115), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + Next locally: `scripts/smoke.sh` all ok (incl. the new most-followed check) except the two `/media/`
  checks (no SeaweedFS / nginx here). Playwright: register → follow 山嵐咖啡 (count 1 → 2) → home feed shows its 2
  coffees → /account lists it → unfollow → empty state, home section gone; a seller sees "1 位追蹤者" on the dashboard
  and no follow button on their own shop; no page errors. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- Follower counts are public (like save counts); the list of who follows a shop is not exposed to anyone, the
  seller included — only the count. Revisit if sellers ask for follower lists (that would be a privacy decision).
- The following feed is "newest coffees" only; "new coffee from a shop you follow" emails belong to Stage 3
  notifications and can read `shop_follows`.

## Session 18 — 2026-11-07 — Roaster replies, most-saved sort, seller engagement, header hardening
PR: #101

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code: a roaster answering in a coffee's comments looked like any
buyer, the new save counts were invisible to sellers and couldn't be browsed by, and a header review found three gaps.

### Shipped (one line per slice: area — what — key files)
- #95 backend — `Comment.fromShop: Boolean!`: the author owns the coffee's shop, computed by an `EXISTS` over
  `shops.owner_id` in every comment read (`commentCols(alias)` in `store/comments.go`), so it follows ownership
- #96 frontend — "店家 / Roaster" badge next to the author on coffee pages (+ load more) and the dashboard's recent
  comments (`AuthorBadge`, `commentAuthorBadge` in `lib/comments.ts`)
- #97 backend — `CoffeeSort.MOST_SAVED` (Query.coffees + Shop.coffees): save count desc, then newest, then id
  (`saveCountJoin` in `store/coffees.go`)
- #98 frontend — `?sort=saved` "最多收藏 / Most saved" on /coffees and shop pages (shared `SORT_PARAMS`)
- #99 frontend — dashboard coffee rows read "… · N comments · N saves" with singular forms (`engagementParts` in
  `lib/dashboard/engagement.ts`; the query fetches `saveCount`)
- #100 cross-cutting — `poweredByHeader: false`; pages send `Permissions-Policy` denying camera / microphone /
  geolocation / payment / usb (`buildPermissionsPolicy` in `lib/csp.ts`); the API sets `X-Content-Type-Options:
  nosniff` on every response, panics included (`middleware.SecurityHeaders`); smoke checks all three

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestCommentFromShop`, MOST_SAVED in `TestListCoffeesSort` / `TestCoffeeSortOrderBy` /
  sort mapping, `TestSecurityHeaders(+OnPanic)`.
- Frontend: tsc, lint, `npm test` (109), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + Next standalone locally: `scripts/smoke.sh` all ok (incl. the new header checks) except the two
  `/media/` checks (no SeaweedFS / nginx here). curl: exactly one 店家 badge on a coffee with owner + buyer comments,
  "Roaster" in English, `?sort=saved` selected. Playwright: seller login → dashboard row "3 則留言 · 0 人收藏", badge
  in recent comments, no page errors. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- `fromShop` is derived, not stored: if a shop ever changes owner (not possible today), old replies follow the new
  owner's identity rule rather than who wrote them as the roaster.
- Permissions-Policy denies `payment`: ECPay checkout (Stage 2) redirects to ECPay, so it isn't needed; revisit if
  an embedded payment sheet is ever used.

## Session 17 — 2026-11-07 — Saved coffees, account deletion, shop structured data
PR: #94

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code: buyers had nothing to do with a coffee but comment, and an
account could only be removed by running SQL (Taiwan's PDPA gives people that right).

### Shipped (one line per slice: area — what — key files)
- #87 backend — migration 008 `saved_coffees` (UUID id, unique per user + coffee, both sides cascade);
  `saveCoffee` (published only) / `unsaveCoffee` (any state; null when the viewer can't see the coffee), both
  idempotent; `Coffee.isSaved` + `saveCount` via request-scoped loaders; `User.savedCoffees` (self / admin only,
  drafts hidden); new per-user bucket `RATE_LIMIT_SAVE_USER` (60/5m) (`store/saved.go`)
- #88 frontend — `SaveButton` under the coffee name (`CoffeeDetailView` takes an `actions` slot; the draft preview
  has none): login link when signed out, optimistic toggle with rollback (`toggleSave`, `settleSave`)
- #89 frontend — /account "我的收藏 / Saved coffees": rows with from-price, Remove, load more, empty state
  (`SavedCoffees`, `appendSaved` / `withoutSaved` / `hasMoreSaved` in `lib/saved.ts`)
- #90 backend — `deleteAccount(password)`: password re-checked (PasswordUser bucket), comments deleted, saves +
  refresh tokens cascade, user row locked so a concurrent `createShop` can't slip in; shop owners and admins get
  FORBIDDEN (`store.DeleteUser`, `ErrOwnsShop`)
- #91 cross-cutting — `POST /api/auth/delete-account` clears the httpOnly cookie; `AuthProvider.deleteAccount`;
  /account "刪除帳號 / Delete account" with password + confirm, explanation instead of a form for shop owners /
  admins (`accountDeletionBlock`, `deleteAccountErrorKey`); smoke covers the route
- #92 frontend — shop pages emit a schema.org `Store` (address in TW, geo when valid, OfferCatalog of the listed
  coffees, left out on filtered lists) (`shopJsonLd` in `lib/seo.ts`); the shop query now fetches lat / lng

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestSavedCoffees`, `TestSaveRateLimit`, `TestDeleteAccount`.
- Frontend: tsc, lint, `npm test` (106), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + Next standalone locally: `scripts/smoke.sh` all ok (incl. the new delete-account check) except the
  two `/media/` checks (no SeaweedFS / nginx here). Playwright: register → shop page JSON-LD (Store, geo, 3 offers)
  → save a coffee (count 0 → 1, survives reload) → /account lists it → Remove → empty state → delete account
  (wrong password message, then success → home, refresh 401). Not run: `docker compose up`.
- Local gotcha: Next renames its process to `next-server`, so `pkill -f server.js` doesn't stop it; and the CSP's
  `connect-src` needs `NEXT_PUBLIC_GRAPHQL_URL` set at runtime when the API isn't behind nginx.

### Decisions / deferred (anything the next session or the owner should know)
- Saved coffees are public as a count only; the list itself is private (self / admin), like "My comments".
- Account deletion removes the user's comments rather than anonymising them (personal data goes with the
  account). Sellers can't delete themselves yet: closing a shop is an owner decision (question to file if asked).

## Session 16 — 2026-11-07 — Sitemap lastmod, comment editing, similar coffees, skip link
PR: #86

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code.

### Shipped (one line per slice: area — what — key files)
- #80 cross-cutting — `Shop.updatedAt` / `Coffee.updatedAt`; migration 006 makes variant insert / update / delete
  touch the parent coffee (trigger), so price and stock changes count. sitemap.xml has `<lastmod>`: a coffee's own,
  a shop's the later of its own and its listed coffees' (`laterDate`, `sitemapEntries` in `lib/sitemap.ts`)
- #81 backend — `updateComment(id, body)` + `Comment.editedAt` (migration 007): author only (admins delete, never
  rewrite), same validation and per-user token bucket as `addComment`, refused (`NOT_FOUND`) once the coffee is
  back in draft; unchanged text is a no-op that leaves `editedAt` null (`store.UpdateCommentBody`)
- #82 frontend — `CommentBody` (client): inline edit with counter / save / cancel for the author while the coffee
  is published, "(已編輯 / edited)" marker everywhere comments list; coffee page, load more, /account My comments,
  dashboard Recent comments (`canEditComment`, `commentEditState`, `commentEditErrorKey`, `withEditedComment`)
- #83 backend — `Coffee.similar(limit)`: other shops' published coffees scored origin 3 + process 2 + roast 1 +
  shared notes (1 each, ≤ 3); below 2 left out; in-stock first, then score, then newest; limit 4 (max 12)
- #84 frontend — coffee page "你可能也喜歡 / You may also like" (`AlsoLike`, `alsoLike` drops the current coffee and
  anything already on the page); smoke checks the seeded 耶加雪菲 page links the seeded Kenya coffee
- #85 frontend — skip link (first focusable, visible on focus) to the layout's single `<main id="main">`; pages,
  error / 404 states and skeletons render a `div`; `tests/landmarks.test.mjs` guards it

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestUpdatedAt`, `TestUpdateComment`, `TestSimilarCoffees` (uses its own reference rows — the first
  version flaked when coffees from earlier runs crowded the limit), `TestSimilarLimit`.
- Frontend: tsc, lint, `npm test` (96), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + Next standalone locally: `scripts/smoke.sh` all ok except the two `/media/` checks (no SeaweedFS /
  nginx here). Playwright: Tab → skip link → Enter focuses `#main` (one `main`); register → comment → edit →
  "(已編輯)" survives reload → edit again from /account; "你可能也喜歡" renders. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- Edits keep the comment's place and date; only an "edited" marker shows. No edit history is kept.
- Similar coffees are a SQL score, no new infra; Meilisearch (Stage 3) could replace it behind the same field.
- `Coffee.similar` runs one query per coffee, like `Coffee.comments`; only the detail page asks for it.

## Session 15 — 2026-11-07 — Per-device logout, sign out everywhere, shop search, in-shop filters
PR: #79

No slices were pickable at the start (Stage 2 still blocked on #9 / #12; no owner answers on any question), so
the six below were filed from gaps found in the code. The main one: `logout` revoked **every** session, and the BFF
skipped revocation entirely when the access token had expired.

### Shipped (one line per slice: area — what — key files)
- #73 backend — `logout(refreshToken: String)` ends only that session (signature checked, no access token needed,
  unknown tokens still `true`); revokes the token plus anything it was rotated into and detaches them from the
  rotation chain (`store.RevokeRefreshToken`, recursive CTE), so a late grace replay is refused, not treated as
  theft. `logoutEverywhere` (and token-less `logout`) end all sessions
- #74 cross-cutting — `/api/auth/logout` sends the httpOnly cookie's token; new `/api/auth/logout-all`;
  /account "登入中的裝置 / Signed-in devices" with a confirm step → home (`bearerToken` helper in `lib/auth/token.ts`)
- #75 backend — `shops(search:)`: every word in name or description (ILIKE, escaped; same limits as coffee search);
  city is not searched (#50). `ListShops` takes a `ShopFilter` (`where()` table-tested)
- #76 frontend — /shops search box (`?q=`) in the sort form, results heading, empty state + "clear search" keeping
  the sort (`shopListHref`); `SortForm` takes extra fields and a submit label
- #77 backend — `Shop.coffees(filter: CoffeeFilter)`: same validation as `Query.coffees`; shop scope and draft
  visibility are set from the parent shop / viewer after validation
- #78 frontend — shop page keyword + roast filter (`?q=&roast=`), "no matches" state with a clear link
  (`shopCoffeesHref`); `ROAST_LEVELS` + `parseRoastParam` moved to import-free `coffeeQuery.ts`

### Verification (what ran and passed; what was NOT tested and why)
- Backend: gofmt, build, vet, `go test -race ./...` with `TEST_DATABASE_URL` on local PostgreSQL 16 (migrations +
  seed). New: `TestRevokeRefreshToken`, `TestLogoutSessions` (checked it fails without the chain detach),
  `TestShopFilterWhere`, `TestShopSearch`, `TestShopCoffeesFilter`.
- Frontend: tsc, lint, `npm test` (86), `next build`; `docker compose config`, `check_brief.sh`.
- API binary + Next standalone locally; Playwright: /shops search → empty state → clear keeps `sort`; shop page
  roast + search → "no matches" → clear; register → /account → sign out of all devices → `/` and refresh 401. That
  run caught /account redirecting to /login instead of home after the sign-out (fixed in f3115e9).
- `scripts/smoke.sh` (new: logout keeps a second session and refuses the old cookie; /shops?q=; shop page filter)
  against that stack: all ok except the two `/media/` checks (no SeaweedFS / nginx here). Back-to-back smoke runs
  exhaust the in-memory per-IP login limit (20/min); one run per API start is fine. Not run: `docker compose up`.

### Decisions / deferred (anything the next session or the owner should know)
- Logout is per device now. Access tokens already issued stay valid until expiry (≤ 15 min) after any logout.
- Shop search deliberately skips city until #50 is answered.

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
