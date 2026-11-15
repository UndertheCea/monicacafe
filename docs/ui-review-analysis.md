# Roaster UI/UX review: analysis for the owner (#298)

The owner's review of nine roaster sites is in [`ui-ux-review.md`](ui-ux-review.md) (copied verbatim from branch
`platform-feature-sumry`). It is **input for a discussion, not a feature list** (see `docs/ROADMAP.md`). This page
scores each idea the issue highlights against what Moni has decided, and recommends **at most three** to try now.
Nothing here is built; only ideas the owner picks in the follow-up `question` issue become slices.

Constraints used: white + black only, no amber, no gradients, colour only in coffee tiles, no sales noise (brief,
"Look and feel"); no cross-shop rating filters (#166, #176 -> #189); shop pages are the seller's storefront with no
buyer controls (#158, #160-#163); no links out, no seller contact details; prices paid / green cost / payments wait
for #201 and #205. Today a coffee already stores origin, variety, process, producer, region, altitude, flavour
notes, optional roast, brew method and harvest year (`schema.graphqls`, `Coffee`).

Sizes: S = under a day, M = a few days (schema + dashboard + page), L = a milestone.

| # | Idea (source) | Moni page | Data needed; can sellers supply it? | Conflicts with past decisions | Size | Recommendation |
|---|---|---|---|---|---|---|
| 1 | "About this product" spec block shown before the story (Coffee Collective, September, Sey, POMA) | `/coffees/[id]` | Already required fields; yes | None. Overlaps #203 item 7 (price under the name): decide the page order together | S | **Adopt**: one hairline two-column table, labels left, values right, above the description |
| 2 | Tiers with a reason: Highlights, Profiles, Seasonal, Rare (La Cabra) | `/shops/[slug]` | A seller-made section name and one-sentence reason per coffee group; yes, seller-written | Fits #158 / #160-#163 only as a seller-side grouping of the manual order, never a buyer filter or a Moni-wide tier list. Overlaps #203 item 8 (shop header) | M | **Adapt**: optional named sections on the shop page, set in the dashboard; no section means today's page |
| 3 | "Want this for espresso?" twin link (Monogram) | `/coffees/[id]` | Seller links two of their own coffees as one lot's twin; yes | No ratings, no filter. Only the seller's own coffees, so no cross-shop comparison | M | **Adapt**: a quiet "Also roasted for espresso / filter" line on the coffee page, seller-chosen |
| 4 | Clean<->Funky and Terroir<->Experimental meters (September) | `/coffees/[id]`, cards | A 1-5 score per axis; sellers can, but on their own scale | Brings back cross-shop taste comparison, the reason the cup profile was removed (#166, #176 -> #189) | M | **Skip** while the scores are per seller. Revisit only if the owner wants words, not scores |
| 5 | "Flavour Mood" navigation (Monogram) | `/coffees`, home | A mood per coffee, defined by Moni or by each shop | Same conflict as 4, plus a Moni-owned taxonomy sellers must obey; sells by mood, not facts | L | **Skip** |
| 6 | Line-ups by packaging (Core / Spotlight / Uncommon, Phil & Sebastian) | Shop page | Seller's own naming | Same as 2; packaging is that shop's own system | M | **Skip**: covered by 2 |
| 7 | Lot codes and a longer FACTS table (Phil & Sebastian) | `/coffees/[id]` | Lot code, exporter, drying, storage; few Taiwan sellers publish them (see the `new-*-reference.md` files) | Adds required-feeling fields after #176 trimmed them | S | **Later**: one optional "lot" text field, only if sellers ask |
| 8 | Agtron number, caffeine per cup, extraction guide (Onyx) | `/coffees/[id]` | Agtron needs a meter; extraction needs brew recipes; sellers rarely have them | Agtron is a roast rating on each shop's own standard (#166); recipes are content Moni would have to police | M | **Skip** |
| 9 | Financial transparency: green cost, market price, price paid to the farmer per kg (Onyx, Coffee Collective) | `/coffees/[id]` | Per-coffee figure; only some sellers will disclose, in USD or NT$ | Waits for #201 (what Moni may state about prices) and #205 | S | **Later**, after #201 / #205 |
| 10 | Colour-blocked typographic cards (Lab19, Sey, POMA) | Cards, `/coffees` | None | Already shipped as the Radix tiles (#111). Card contents are #203 items 1-2 | - | **Skip** as new work; answer #203 1 / 2 |
| 11 | Two-typeface system: caps labels + serif names (Sey, Lab19) | Whole site | None | Wordmark is the heavy italic (#110); a serif is a new brand decision, and it touches the design tokens of #229 / #230. Overlaps #203 item 6 | L | **Later**: after #203 6 and 8 are answered |
| 12 | Monogram banners, order counters, testimonials, "Buy 4 save", subscription tiers | Home, listings | Sales data | Sales noise; subscriptions are in no stage (ROADMAP) | L | **Skip** |
| 13 | Place as content (La Cabra), mission sentence and numbers row (POMA) | Home | Moni's own copy, counts from the database | Home is already stripped to intro, coffees, shops (#186); #203 item 4 decides the filler | S | **Later**: one sentence only if #203 4 is "yes" |

## Relation to question #203

#203 (still open; items 1, 2, 4, 8, 9 unanswered) asks about the site's own tidying. The review ideas relate to it
like this, so the owner can answer both in one pass:
- Row 1 shares the coffee page with #203 item 7 (price under the name).
- Row 2 shares the shop page with #203 item 8 (shop header); do the header first.
- Rows 10 and 11 are the same question as #203 items 1, 2 and 6 (cards, grid, one type and grey scale).
- Row 13 depends on #203 item 4.

## Recommendation

Try at most three, in this order, each small and reversible: **1** the spec block (no new data), **3** the
seller-chosen roast twin link, **2** seller-made shop sections. Everything else is skipped or waits for #201, #205
or #203. Default is to build none; the follow-up `question` issue states that default as safe.
