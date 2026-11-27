# Front-end design guide

Read this before changing anything people see: a page, a component, a class, a dictionary string. It keeps Moni Cafe
looking designed, not generated. The owner's decisions in `PROJECT_BRIEF.md` ("Look and feel", "Decisions") win over
anything here; open questions about the look are GitHub issues labelled `question` (#203, #306, #552).

`tests/design.test.mjs`, `tests/palette.test.mjs`, `tests/contrast.test.mjs` and `tests/ui.test.mjs` enforce the
checkable parts. A rule they can't check still applies.

Adapted from **unslop** by Damir Sokolovsky (github.com/heydamir/unslop, CC BY 4.0), to this product and its owner's
decisions.

## Direction

- **Product.** A Taiwan marketplace where specialty-coffee roasters list their coffees and buyers find them by origin,
  variety, process and flavour.
- **Character.** Exact, unhurried, a little warm. Like a good roaster's bag label, not like an app store.
- **World.** The roastery counter: kraft bags, printed labels, cupping notes, a white wall. References the owner chose:
  SEY, La Cabra, Coffee Collective, Poma.
- **The moment.** The coffee itself: a seller's photo, or the soft Radix colour tile behind a coffee without one. It is
  the only colour on the site. Everything around it is quiet.
- **Signature.** The italic, heavy, lowercase "moni cafe" wordmark (#110). One wordmark, used only as the logo.

If a change makes a screen that would still fit after you swap "Moni Cafe" for any other shop's name, it isn't done.

## Colour

- White page, black type. Use only the tokens in `app/globals.css`: `ink`, `muted`, `faint`, `line`, `paper`,
  `danger`. Change the look there, in one place.
- Three text roles: `ink` (primary), `muted` (secondary, still ≥ 4.5:1), `faint` (placeholders and disabled only).
- The one colour is the coffee tile (`lib/coffeeTile.ts`, set by inline style). No accent colour, no amber or yellow,
  no gradients, glows, coloured shadows, washes or blobs, and no dark hero block.
- `danger` red means an error or a destructive action, nothing else.
- Depth comes from a hairline (`ring-1 ring-line`) and a `paper` surface step, never from a shadow or blur.

## Type

- The system sans for everything. The only web font is the wordmark's (`next/font`, Inter Tight 800 italic).
- `font-extrabold`, `font-black` and `italic` belong to the wordmark only (`components/Wordmark.tsx`, the 404 page).
- Hierarchy comes from size and colour first. Use the recipes in `lib/ui.ts` (`PAGE_TITLE`, `SECTION_TITLE`, `LABEL`,
  `FIELD_LABEL`) instead of new heading styles.
- Uppercase tracked labels come only from the `LABEL` recipe (`.label-caps`, the SEY-style origin line). Chinese is
  never spaced out (`:lang(zh)` resets it). Don't invent other uppercase labels.
- Numbers use one format: `formatTWD` for prices ("NT$450"), grouped thousands, `tabular-nums` where figures line up
  in a column (prices, counts, altitude).
- Small text never gets negative letter spacing.

## Spacing and layout

- Tailwind's 4 px scale only. An arbitrary value like `mt-[13px]` must be a multiple of 4 px (or a fraction of an
  `em` for type-relative gaps).
- Same thing, same size: cards in a grid share one padding (`p-4` in lists, `p-6` for panels), rows in a list share one
  height and gap.
- Space shows grouping: smaller gaps inside a group than between groups.
- Every page sits in `<Page>` (one max width, one gutter). Don't widen or narrow single pages.
- Compose the first screen as a whole. No empty band at the top: content starts close under the header.
- One primary action per area. A second action is `secondary` or `quiet`, never another black button beside it.
- Phones: everything stacks in reading order, and no text goes below 12 px.

## Components

- Build from `components/ui` (`Button`, `Field`, `Card`, `Badge`, `Picture`, `ConfirmButton`) and `lib/ui.ts`. A new
  look for a control is a change to the recipe, not a one-off class string.
- One box radius (`rounded-box`) for cards, fields, images and panels. Pills (`rounded-full`) are for buttons, chips and
  round icon buttons, and that's the whole list. A nested corner is the outer radius minus the padding.
- Cards are flat: white, a hairline ring, no hover lift, no scale.
- Counts and meta are quiet `muted` text, not badges. A zero count is better hidden than shown.
- Badges are rare and plain text (`Badge`), never "New", "Hot", "PRO" or a sparkle.
- Icons are simple text glyphs or one line-icon set at one size, in the text's colour. No emoji in the interface.
- Seller text is shown as typed, through JSX, never as HTML.

## Copy

- Every string goes through `t()` with zh-TW first and English second; both say the same thing.
- Say what is there, plainly: "暫無庫存" / "Out of stock", not a slogan.
- No exclamation marks, no "!!", no "！" (`tests/design.test.mjs`, #552 E).
- No full stop on headings, labels, buttons or one-line notes (any string of one sentence, e.g. "購物車是空的" /
  "Your cart is empty"). Paragraph copy (`…Body` keys) and strings of two or more sentences keep theirs; the same test
  checks it.
- No hype words (seamless, supercharge, unlock, magic, revolutionary, effortless, AI-powered) and no unverifiable claims
  ("trusted by thousands", star ratings without a source).
- Titles name the page ("探索咖啡豆"), never greet the reader.
- Placeholders are short ("搜尋" / "Search").

## Images

- A seller's photo goes through `<Picture>` (thumbnails, lazy loading, the box radius).
- A coffee without a photo gets its soft Radix tile (`lib/coffeeTile.ts`). On cards it carries the coffee's words
  once, in the seller's case; on the coffee page it is plain.
- No stock photos, illustrations, 3D blobs or decorative images. A section doesn't need a picture to exist.

## Motion

- Transition colour, background, border, opacity or transform only, by name (`transition-colors`,
  `transition-opacity`). Never `transition-all`, never width / height / top / left.
- No `hover:scale`, bounce, ping, spin, parallax or entrance animations on cards.
- `animate-pulse` only for something that is live, such as a pending dot, and always under `motion-safe:`.
- One ease, short durations. Respect `prefers-reduced-motion`; the drawer and smooth scroll already do.

## Accessibility (non-negotiable)

- Text contrast ≥ 4.5:1 (`tests/contrast.test.mjs`), tap targets ≥ 44 px, the global 2 px ink focus outline (never
  `outline-none` without a replacement), one `<main>`, labelled controls, `lang` on mixed-language spans.
- axe runs on 13 pages in CI (`e2e/`); a new page joins that list.

## Before you finish a visual change

1. Look at it: run the stack and screenshot the page at 390 px and 1440 px (`scripts/smoke.sh` routes are a good list).
2. Go through this list: tokens only · no new colour or gradient · no emoji · no "!" · no full stops on short strings ·
   recipes from `lib/ui.ts` · 4 px spacing · equal things equal · one primary action · no empty first-screen band ·
   flat cards · named transitions only · contrast and focus intact.
3. Template check: would the screen fit another product? Then push it toward the roastery label: real coffee
   words, figures set with care, and the coffee as the only colour.
