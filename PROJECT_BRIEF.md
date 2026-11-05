# Moni Cafe — Project Brief

The current picture: goal, status, focus and the reasons behind it. **How** to work (rules, architecture,
verification, the issue workflow) is in [`CLAUDE.md`](CLAUDE.md). The work queue and owner questions are
**GitHub Issues** (labels `slice` and `question`). History is in [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md).

Rewrite "Status", "Last session" and "Current focus" every session; keep this file under 250 lines
(`scripts/check_brief.sh` enforces it in CI).

Last updated: 2026-11-05 (after Session 8)

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
| DB schema + migrations 001–005 | Done |
| Go store (pgx) + GraphQL API for Stage 1 | Done — incl. variant CRUD, delete draft coffee |
| Auth (JWT + refresh rotation with 20 s replay grace; BFF cookie flow in Next) | Done — expired tokens pruned hourly |
| Pages: home, /coffees (+filters), /coffees/[id] (+comments), /shops, /shops/[slug], /map | Done |
| /login, /register, account menu | Done |
| Seller dashboard: open shop, coffees (new / edit / options / publish / delete draft), shop profile + location | Done |
| Draft preview for sellers (dashboard-only, #8 default) | Done |
| Image uploads: presigned API, S3 store (SeaweedFS) behind nginx `/media/`, uploader UI | Done |
| Content-Security-Policy (nonce'd, from Next middleware) | Done |
| sitemap.xml + robots.txt (`SITE_URL`) | Done |
| Rate limiting on auth mutations (#27) | Todo |
| CI: backend, frontend, compose config, **full stack compose + smoke** | Done |
| Full `docker compose up` through nginx | Verified session 8 (and now in CI) |

## Last session

**Session 8** — refresh-token replay grace window (#24, migration 005) and hourly pruning of expired tokens (#25);
seller draft preview (#19) and delete-draft (#26); sitemap.xml + robots.txt (#28). Proved `docker compose up` +
`smoke.sh` on a real daemon (#20; smoke now drives the auth cookie through nginx) and added a CI `stack` job that
does the same on every PR. Not seen in a browser: an actually aborted refresh (covered by smoke + integration test).

## Current focus

Last Stage 1 slice: #27 (rate-limit login / register / refresh). After that Stage 1 is done; Stage 2 is blocked on
the owner's answers to #9 (cart storage) and #12 (commission + payouts). Housekeeping queued for Stage 2: #29
(orphaned images in the bucket).

Open questions for the owner (answer by commenting on the issue):

| Issue | Question | Default | Safe? |
|---|---|---|---|
| #7 | Image storage | S3-compatible (SeaweedFS in dev) | yes |
| #8 | Draft previews | dashboard-only preview | yes |
| #9 | Cart storage (Stage 2) | Postgres | **no** — blocks #21 |
| #10 | Production map tiles | keep OSM for the demo | yes |
| #11 | Next.js 16 upgrade | after Stage 1 | yes |
| #12 | Commission + payouts (Stage 2) | none | **no** |

## Decisions (why it looks like this)

- **Hand-written pgx store, no sqlc / ORM** — no codegen toolchain; every query is visible in one package.
- **gqlgen with hand-written models + dataloaders** — relationships resolve lazily without N+1 queries.
- **Refresh token in an httpOnly cookie behind Next route handlers** — XSS can't steal a 7-day credential; the
  access token lives only in memory. Refreshes are serialised across tabs because reusing a rotated refresh
  token revokes every session (theft detection).
- **Server components fetch anonymously** — simple caching, no token on the server; the cost is that draft
  pages 404 publicly (#8).
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
- **CSP with per-request nonces** — no `'unsafe-inline'` scripts; styles keep `'unsafe-inline'` for React/Leaflet.
