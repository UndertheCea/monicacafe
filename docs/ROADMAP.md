# Moni Cafe — Roadmap

Written 2026-11-10 after a full review of the code, the running site and the deployment files. It says **what to
build next, in what order, and why**. The work itself lives in GitHub Issues; this file only orders it. The
current state is in [`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md); the rules are in [`CLAUDE.md`](../CLAUDE.md).

Agents: pick work with the normal rules in `CLAUDE.md` (priority, then issue number). The order below matches the
priority labels, so you don't need this file to pick a slice. Read it when you need to know how the pieces fit, or
when you open follow-up slices. Update the tables when a milestone's issues close or a decision changes the plan.

## Where the project stands

Stage 1 (discovery) is feature-complete as a demo: browsing, accounts, comments, saves, follows, seller dashboard,
image uploads. What the review found is that it is **a good local demo and not yet a site that can be put on the
internet**:

- **It can't be deployed.** No HTTPS, no domain, no production compose file, no backups, and schema changes can't
  reach a database that already has data.
- **A few real security holes**, the worst being that a production start accepts the signing keys published in this
  repository (anyone could mint an admin token) and that one anonymous GraphQL query can run thousands of scans.
- **Accounts are incomplete.** No password reset, no email verification, no way to report or remove bad content,
  no admin screen, no terms or privacy pages.
- **The UI is consistent but busier than the reference sites**, and the design tokens are mostly unused, so small
  mismatches have crept in.
- **Stage 2 has unmade business decisions** (money flow, invoices, returns, shipping) that shape its tables.

## Audit of 2026-11-14 (after Stage 2 opened)

A second full pass: every resolver's permission check, the deployment files, the new Stage 2 code, and screenshots of
every page. It looked for what earlier sessions took for granted. Everything below is an issue; nothing was changed in
code. **Do the p1 rows before any order or payment code**: three are holes a stranger can use today, and one is a
locking problem that only shows under real sales.

| Order | Issue | What was found | Priority |
|---|---|---|---|
| 1 | #282 | A seller can republish a coffee an admin took down, and erase the reports on it; a suspended shop's owner keeps full write access | p1 |
| 2 | #283 | Aliased GraphQL fields dodge the cost limit (200 catalogue scans or ~3,700 queries in one anonymous request, reproduced); a NUL byte gives a 500 | p1 |
| 3 | #287 | `docker compose up` on a public server runs in development mode with the repo's published signing keys; production checks miss CORS, `SITE_URL`, S3 keys and more | p1 |
| 4 | #290 | Each stock decrement rewrites and locks the whole coffee row; multi-item checkouts can deadlock; reorder breaks after an archive; the worker isn't in the image | p1 (stage-2) |
| 5 | #284 | A stolen or revoked token still reads the data export, cart, emails and admin views for 15 minutes | p2 |
| 6 | #285 | Photos that aren't re-encoded keep GPS position and phone details | p2 |
| 7 | #286 | The contact-details filter misses Chinese numerals, IG / WeChat / Shopee wording and never checks names; display names can impersonate staff; `User.role` is public | p2 |
| 8 | #288 | Images have no backup; the orphan sweep would empty the bucket if pointed at the wrong database; nginx caches 404s for a year | p2 |
| 9 | #289 | Backup failures are silent, retention counts files not days, the CI drill skips encryption and S3, `MIGRATE_BASELINE` is unverified | p2 |
| 10 | #291 | Cart: "checkout coming soon" under "Add to cart", no cart link in the header, price notice vanishes on a quantity change, sellers can buy from themselves, carts never expire, no browser tests | p2 (stage-2) |
| 11 | #294 | UI: text repeated on every card without a photo, shouting capitals beside Chinese, buy controls far from the price, thin shop page, `/map` lists every shop and overflows on phones | p2 |
| 12 | #295 | Small leaks and quirks: register reveals accounts, targeted lock-out, test rows left in the dev database, container hardening, CI scanning gaps | p3 |

Checked again and still sound: cross-seller ownership checks, parameterised SQL and whitelisted sort orders, JWT
algorithm / issuer / expiry checks with separate secrets, token-version check on every mutation, admin mutations checked
against the database, cart lines scoped to their owner, image URL validation, the X-Real-IP chain, `/media/` limited to
GET / HEAD / PUT with the sandbox CSP, pinned CI actions, migration locking.

What this audit did **not** cover: the English pages, the seller dashboard forms beyond the first screen, screen-reader
behaviour, load testing, and anything that needs the real ECPay sandbox or a deployed host.

## Milestones

Do them roughly in this order. M1 and M2 can run in parallel with M3; M4 needs the owner; M5 needs M1 + M4.

### M1 — Safe to expose (security) · label `stage-1`

| Order | Issue | What | Priority |
|---|---|---|---|
| 1 | #206 | Production refuses the secrets published in the repo; `APP_ENV` must be explicit | p1 |
| 2 | #207 | GraphQL cost limits: complexity × list size, depth, token limit, per-IP limit | p1 |
| 3 | #208 | Open redirect through `?next=` | p1 |
| 4 | #211 | Compose stops publishing Postgres / API / Next; `X-Forwarded-For` can't be spoofed | p1 |
| 5 | #213 | Seller-write limits, caps, login lockout, IPv6 keys, bcrypt cost | p2 |
| 6 | #214 | nginx: uploads folder sandboxed, request limits, timeouts | p2 |
| 7 | #215 | Auth cookie `Secure` from `SITE_URL`, Origin check, CSP reporting | p2 |
| 8 | #216 | CI: govulncheck, npm audit, Dependabot, SHA-pinned actions | p2 |
| 9 | #217 | Control characters in text, DB length checks, upload quota | p3 |

Checked and found sound (no issue needed): ownership checks on every mutation (no way for one seller to edit
another's shop, coffee, option, image or comment), parameterised SQL, JWT algorithm pinning, refresh rotation with
reuse detection, presigned uploads limited to three image types and the owner's key prefix, nonce'd CSP, httpOnly
refresh cookie, generic login errors.

### M2 — Clean and consistent (UI / UX) · label `stage-1`

| Order | Issue | What | Priority |
|---|---|---|---|
| 1 | #227 | Bug: flavour chips link to an unfiltered list | p1 |
| 2 | #228 | Bug: a network hiccup wipes the seller's form; unsaved-changes protection | p1 |
| 3 | #229 | Design system 1: tokens everywhere, one grey scale, flat cards, one page width | p2 |
| 4 | #230 | Design system 2: one Button / Input / Card / heading scale | p2 |
| 5 | #231 | Accessibility: contrast, tap targets, language tags | p2 |
| 6 | #232 | Forms: errors by the field, focus, one confirm pattern | p2 |
| 7 | #233 | Coffee page: price and sold-out under the name | p2 |
| 8 | #234 | Speed 1: unused fonts, scroll, no refresh call for signed-out visitors | p2 |
| 9 | #212 → #235 | Shrink photos at upload, then right-sized images + catalogue caching | p2 / p3 |
| 10 | #236 | Small UX fixes (map, error page, pagination, search) | p3 |

Do #229 before #230, and both before any visual proposal from #203, so later changes are one-file edits.
**Waiting on the owner (#203):** simpler coffee cards, two cards per row on phones, removing the "why Moni Cafe"
block, a new shop header, a real footer. Open one slice per approved proposal.
**Waiting on the owner (#204):** `/en/…` URLs and optional English fields for seller text.

### M3 — Can run in production (operations) · label `stage-1`

| Order | Issue | What | Needs |
|---|---|---|---|
| 1 | #209 | Migrations tracked and applied on every start | — |
| 2 | #210 | One frontend image for any host (no baked-in localhost) | — |
| 3 | #220 | Nightly backups + a restore drill in CI | — |
| 4 | #222 | Redis / Meilisearch only when used | — |
| 5 | #221 | Metrics, readiness check, error reporting hook, clean shutdown | — |
| 6 | #219 | HTTPS, `docker-compose.prod.yml`, image publishing, `docs/DEPLOY.md` | **#199** |

How the hard parts are meant to be set up (details in each issue):
- **Hosting (default in #199):** one small VPS running the same compose file CI tests, Caddy or nginx + Let's
  Encrypt in front, images in an external S3 service (Cloudflare R2 or similar), Postgres in a container with an
  encrypted nightly dump to a second bucket. Move Postgres to a managed service when orders make a day of data
  loss unacceptable.
- **Migrations:** plain SQL files stay; a version table records what ran; a one-shot compose service applies new
  files before the API starts. Never edit a merged migration.
- **Secrets:** only in the server's `.env` (never in the repo); production refuses to start with any value that
  appears in `.env.example`.
- **Scaling out later:** rate limits and the two background sweeps are per process. Before running a second API
  instance, move limits to Redis and guard sweeps with a Postgres advisory lock (#221 does the lock).

### M4 — Trustworthy accounts and content · label `stage-1`

| Issue | What | Needs |
|---|---|---|
| #223 | Forgot-password + email verification | **#200** (email provider) |
| #224 | Suspend users / shops, admin unpublish, audit log, token versioning, admin CLI | #202 has safe defaults |
| #225 | Report a comment / shop, `/admin` screen, no contact details in text | #224 |
| #226 | Terms, privacy, about, contact pages; consent at registration | **#201** items 6–7 |

### M5 — Stage 2: buying · label `stage-2`

The owner opened Stage 2 on #197 (2026-11-14); blocked `stage-1` slices stay in the queue. Rows 1–3 shipped in
Session 38. **Before row 4 (orders): #290, #282, #283 and #287 from the audit above**, for the same reason M1 came
before M5: taking payments on a site with known holes is the one thing that must not happen.

| Order | Issue / slice to open | What | Needs |
|---|---|---|---|
| 1 | #237 (#276–#279) | Groundwork: atomic stock, soft deletes, strict money parsing, worker. **Done**; the ECPay test vector is still missing (docs unreachable from sessions) | — |
| 2 | #21 | Cart tables and resolvers (Postgres, per #9). **Done** | — |
| 3 | #280 | Cart UI: add to cart on the coffee page, `/cart`. **Done**; follow-ups in #291 | #292 for some |
| 3a | #290 | Stock locking, deadlock-free multi-line reservation, idempotent release, worker in the image | — |
| 4 | open after #205 + #201 | Orders: one order per shop per checkout, item snapshots, status machine | **#205, #201** |
| 5 | open after #12 + #201 | ECPay payment: create trade, server callback route (form-encoded, not GraphQL), idempotent on the trade number, amount check | **#12, #201** |
| 6 | open after #205 | ECPay logistics: 超商取貨 + 宅配, label printing from the dashboard | **#205** |
| 7 | open after #201 | 電子發票 | **#201** |
| 8 | open later | Seller order screen, buyer order history, order emails (needs #223's mail sender) | — |
| 9 | open after #12 | Commission ledger and payout report | **#12** |

Design rules for Stage 2, so each slice doesn't rediscover them:
- **Money:** integer NT$ everywhere; an order line stores its own copy of name, grind, weight and unit price.
  Totals are recomputed on the server and compared with ECPay's amount in the callback.
- **Stock:** decrement with `UPDATE … SET stock = stock - n WHERE stock >= n` inside the order transaction; never
  read-then-write.
- **Payments:** the callback handler verifies `CheckMacValue` in constant time, logs the raw payload, and is safe
  to receive twice. An order is paid only by the callback, never by the browser's return URL.
- **Deletes:** nothing an order points at is hard-deleted; account deletion for a buyer with orders anonymises.
- **Jobs:** emails, payment-timeout expiry and stock-hold release run in the River worker, not in request handlers.
- **Locking:** reserve all of an order's lines in one fixed order (sorted option id); a stock change must not touch
  the coffee row (#290). Every reservation has a record and is released exactly once.
- **Private reads:** order history, addresses and anything else private check the token version on queries too (#284).
- **River upgrades:** migration 021 is a hand-copied snapshot of River's schema; a River version bump needs a new
  migration with the matching SQL (the `rivermigrate.Validate` test fails until it exists). Expect Dependabot PRs for
  River to be red for that reason.
- **Testing:** every payment path has an integration test against ECPay's documented sandbox values; no test
  talks to the real ECPay.

### M6 — Stage 3: growth · label `stage-3`

Unchanged from the brief: Meilisearch search (replace the `ILIKE` keyword search behind the same
`CoffeeFilter.search` field; add `pg_trgm` first if search gets slow before then), seller analytics, curated
collections, email notifications for followed shops.

## Decisions waiting for the owner

| Issue | Decision | Blocks | Default safe? |
|---|---|---|---|
| #199 | Hosting and domain | #219 | **no** |
| #200 | Email provider; who must verify | #223 | **no** |
| #201 | Company, money flow, invoices, returns, food rules, legal texts, contact | #226, most of M5 | **no** |
| #202 | Who may open a shop; reports; who is admin | shape of #224 / #225 | yes |
| #203 | UI proposals 1, 2, 4, 8, 9 | follow-up UI slices | yes (3, 5, 6, 7 proceed) |
| #204 | `/en` URLs; bilingual seller text | follow-up slices | yes (no change) |
| #205 | Multi-shop checkout, shipping, stock holds, guest checkout | M5 | **no** |
| #12 | Commission and payouts | M5 payments | **no** |
| #292 | Exact stock shown to everyone, NT$0 items, buying from your own shop, cart lifetime, 20-bag cap | parts of #290 / #291 | yes, except the stock display |
| #293 | Exact map pins for home roasters | follow-up slice | yes (warning text only) |

## Things nobody has considered yet

Not issues yet, because each needs a decision or is premature. Open a `question` or `slice` when it becomes real.

- **Seller onboarding beyond the form:** how a roaster hears about the site, a "how selling works" page, the
  seller agreement, and proof they are a real business (ties to #201 item 5 and #202).
- **Blends as first-class coffees** (#176 point 2): the required single origin / variety / producer doesn't fit a
  blend. Still waiting for an owner ask.
- **Roast date and freshness:** specialty buyers care about the roast date; nothing stores it. Probably a
  per-option or per-batch field once orders exist (#205 item 6).
- **Subscriptions** (a bag every two or four weeks) are common for roasters. Not in any stage.
- **Reviews vs comments:** comments are open to anyone; after Stage 2, "verified buyer" marks or ratings may be
  wanted. Decide before building the order history screen.
- **Notifications:** no email or in-app notice when a seller replies to a comment or a followed shop lists a
  coffee (Stage 3 mentions email only).
- **Analytics and consent:** no page analytics today. Adding any tracker needs a consent decision and a CSP
  change; a cookieless, self-hosted tool avoids both.
- **Data requests:** export shipped (#270); sellers still can't close a shop themselves (#93 is open).
- **Abuse at scale:** CAPTCHA or proof-of-work on registration isn't planned; the rate limits in #213 are the
  only brake. Revisit if spam accounts appear.
- **Image moderation:** uploaded photos are never reviewed. Reports (#225) cover it reactively.
- **Search quality in Chinese:** synonyms and 簡 → 繁 shipped (#269). Multi-word names ("Costa Rica") and CJK words
  glued to other text still don't expand.
- **Disaster basics:** who holds the domain, the server login, the ECPay account and the backup key, and what
  happens if that person is unavailable. Write it down once #199 is answered.
- **Reference shops (#170–#174):** still blocked by network access; they no longer hold Stage 2 up (#197).

Added by the 2026-11-14 audit:

- **Account takeover once money moves.** One password protects a seller's shop and, later, their payout details.
  There is no second factor, no "new sign-in" email, no list of signed-in devices to revoke one by one, and an
  admin account is a single password too. Needs the mail sender (#200 / #223) first; plan it before payouts (#12).
- **Signing-key rotation.** One access and one refresh secret with no key id: rotating them signs everyone out, and
  no runbook says how or when (e.g. after a suspected leak).
- **What sellers see about buyers.** Orders will hand sellers names, phones and pickup stores. Decide what is shown,
  for how long, and how it is kept out of exports and logs (ties to #201).
- **Email squatting.** Without verification anyone can register with someone else's address and block them; #223
  fixes it, but accounts created before then need a plan (verify on next sign-in).
- **Photos are the unfiltered channel.** Text is filtered for contact details; a photo of a QR code or a business
  card isn't, and nobody reviews images. Reports are the only brake.
- **Trust in what a listing claims.** Nothing checks that a "Geisha" is one, or that a photo is the seller's own
  (copied product shots). Decide whether the terms, reports or a verification mark handle it.
- **The site in English.** `/en` URLs wait on #204; meanwhile the audit only looked at zh-TW pages, and English
  strings have never been reviewed by a reader.
- **Capacity.** Nothing has been load-tested. `/map` and the sitemap return every shop / coffee in one response;
  the keyword search is a sequential scan. Fine for hundreds of coffees; measure before thousands.
- **A staging site.** Every change goes from CI straight to what will be production. With payments, a second
  environment pointed at ECPay's sandbox is the normal safety net (and must never share the image bucket, #288).
