# Roaster websites: UI/UX review

Checked 2026-11-13 in a desktop browser at 1280×800, plus a phone-width (375px) check of La Cabra. I read each site's page structure and computed styles and took screenshots where the browser allowed. I haven't seen the current Moni Cafe page, so comparisons to it rely on your note that La Cabra is the closest match.

Your ranking going in: **Poma best**, **Monogram and Phil & Sebastian worst**, the rest somewhere in between, and **La Cabra closest to the current Moni page**. What I found mostly agrees, and this review explains why.

---

## 1. At a glance

| Site | What it is, in one line | Best idea to borrow | Main weakness |
|---|---|---|---|
| **POMA** (benchmark) | A research lab that happens to sell coffee | Coffee presented as a result of research: stats, trials and publications, with only 4 coffees on the public menu | Very sparse product data on wholesale-only listings; small catalogue |
| **La Cabra** | A quiet, editorial Scandinavian roastery-bakery | Coffees grouped into tiers that each explain why they exist (Highlights, Profiles, Seasonal, Rare), plus one colour and flower photo per coffee | Technical data is hidden in a collapsed accordion; long product pages repeat country essays |
| **Coffee Collective** | A clear, plain Danish menu | A short "About this product" spec block, plus the **price paid to the farmer per kg** on every coffee | Visually generic; filter and espresso roasts listed as unrelated products |
| **September** | A tiny micro-roaster in Ottawa with a shop built around its parameters | **Clean↔Funky and Terroir↔Experimental meters** on every coffee, and a strict parameter list | Homepage is almost empty (2 sections); a "Seasoning Coffee" listing sits inside the coffee grid |
| **Phil & Sebastian** | A large Canadian roaster with lots of content | Explaining the line-ups by **packaging** (coloured bag = Core, white = Spotlight, tin = Uncommon), lot codes like `26ETH06` | Every heading in 54px capitals, an 8,000px homepage, a stale Halloween promo in November, about 22 popup/modal elements |
| **Monogram** | A direct-to-consumer, conversion-first shop | **"Flavour Mood"** navigation, plus a "Want this for espresso?" link between filter and espresso twins | Sales noise: emoji headings, "160,000+" and "150,000+ orders" banners on the same page, testimonials, reasons-to-buy blocks |

| **Lab19** | A Taipei roaster whose product photos are spec sheets | **Colour-blocked typographic cards**: each coffee's "photo" is a flat colour panel with name, notes and a spec table set in type | Thin buy box; the stacked tiny nav in the corner is easy to miss |
| **Sey** | A Brooklyn micro-roastery with an almost-silent layout | **Two-typeface discipline** (tracked condensed caps for labels + a book serif for names), plus one colour field per coffee | Very little copy; the homepage is mostly a photo and three short blocks |

Lab19, Sey and POMA get a full **visual** breakdown (what makes them look simple and pretty, measured) in [section 10](#10-visual-design-lab19-sey-poma-why-simple-looks-good).

From the earlier data pass (not a design review):
- **Onyx**: the richest product page: Agtron number, caffeine in mg per 12oz, extraction guide with a timer, and a "financial transparency" block (green cost, market price, cup score).

---

## 2. POMA: why it works (benchmark)

- **Positioning comes before product.** The homepage opens with one sentence about what POMA *is* (a coffee research and cultivation company in Copenhagen), then a **Research Overview** row of big numbers (34 active trials, 12 partner farms, 11 countries, 14 publications). Only after that comes a single featured release, then "Current Menu" (4 coffees), then Publications. The shop sits inside the story.
- **Very little navigation.** Research, Coffee, Publications, Advisory, About. Five items, no mega-menu.
- **One typeface, one weight family.** TWK Lausanne throughout, near-black on white, large type. There's no decoration to compete with the content.
- **Product pages end in "Technical Data".** Producer, Origin, Altitude, Varietal, Process and Harvest come after a short paragraph about the partnership, which reads like a lab report.
- **Scarcity is shown with a date, not a countdown banner:** "Release: September 4, 12.00 (UTC+1)."
- **Its weakness:** many listings are wholesale-only, with no technical block. The public catalogue is tiny, so it's easy to look curated.

**For Moni:** decide the one sentence that says what Moni *is*, and let the shop follow it. Show the numbers that prove that sentence.

---

## 3. La Cabra: closest to your page, explored in more depth

### Visual system
- **Background** is a warm off-white `rgb(248, 241, 236)`. **Text** is a dark olive-charcoal `rgb(52, 53, 42)` at 75% opacity for body copy, so it reads softer than black.
- **Type pairing:** "Anth" (a high-contrast display serif, used at 33–44px weight 400 for section titles) with **Gotham** (geometric sans, 16px, for body text and product names at weight 500). The logo is a widely letter-spaced condensed sans ("L A C A B R A").
- **Buttons** are square (0px radius), olive fill with off-white text, in small caps ("ADD TO CART", "LEARN MORE").
- **The product photo system is the signature.** Each coffee gets **its own flower or plant photograph and its own label colour**, and the bag sits in front of it. Kiangoi has purple statice flowers and a purple label; Herbazu has blue hydrangea; La Divina has dark green leaves. The **bag label prints the tasting notes** ("REDCURRANT AND HIBISCUS"), so the photo itself does the flavour communication.
- The header is sticky, thin (about 54px) and transparent over the hero. There's a utility bar above it ("Wholesale login · Discover the Gift Selection → · region").

### Homepage (about 5,600px)
1. Full-bleed seasonal hero (Advent Calendar) with one short paragraph and one button.
2. **Latest releases:** 8 product cards. Each shows a **tier tag** (SEASONAL / RARE / HIGHLIGHT), name, "Country | sizes", and price.
3. Category tiles: Gifts & Bundles, Favourites, K.H. Würtz, Coffee, Single Serve.
4. Story blocks: Christmas Calendar, the **Chelsea café** ("directly beneath the High Line"), Würtz ceramics, Single Serve.

The rhythm is product, then place, then craft objects. It sells a lifestyle around the coffee without shouting.

### Coffee listing (`/collections/coffee`): the strongest page
- There's **no filter sidebar.** The catalogue is grouped into **named tiers**, and each tier has a full-width section with a 2–3 line explanation:
  - **Highlights:** "fleeting opportunities… may not return"
  - **Profiles:** constant taste profiles (Luna, Terra) built from rotating lots
  - **Seasonal Selection:** "the archetypal flavour profiles of the regions we work in"
  - **Rare:** "the pinnacle of quality… competitions and auctions"
- Cards are large (about 575×400 image, 2 per row on desktop). Each card has **one descriptive sentence that names the producer and notes**, plus Add to cart directly on the card.
- With only about 10 coffees, grouping beats filtering. The visitor learns *how to think about the menu* as well as what's on it.

### Product page
- An eyebrow (country, letter-spaced caps), the title in the serif, the one-line description, price, size selector, Add to cart.
- Then four accordions: **About** (Coffee Expression, Producer, "Whole Bean Coffee / Both for filter and espresso"), **Technical Data** (Producer, Region, Altitude, Varietal, Process, Harvest), **Brewing Advice** (water under 150 ppm, rest for 10+ days), **Shipping & Delivery**.
- Then a long story: the producer's history, then a general country essay (for example, why Ethiopian coffee grows semi-wild).
- Then cross-sells: "You might also like" (other coffees) and **"Complete your setup"** (V60, filters, ZeroWater, mineral drops). These are well-chosen and relevant.

### On a phone (375px)
- The image comes first and fills the width. The country eyebrow, serif title and centred description sit under it. The serif stays readable, and the colour-matched flower photo carries well on a small screen.
- The utility bar shrinks to the gift link and region. Search, cart and a hamburger menu sit at the top right.

### What La Cabra does that's worth keeping on Moni
1. **Tiers with reasons** instead of filters, while the catalogue is small.
2. **A visual identity per coffee** (colour + image + notes on the label), so each coffee is recognisable without reading.
3. **A calm palette:** off-white, olive, one serif with one sans, square buttons.
4. **Relevant cross-sells** ("Complete your setup"), not random merch.
5. **Place as content:** the café is a homepage section, not just a footer link.

### Where Moni can do better than La Cabra
- **Technical data is collapsed.** Altitude, process and varietal sit inside a closed accordion, behind the About text. Show 4–6 key facts at the top, the way Coffee Collective and September do.
- **No tasting-notes field.** Notes live only in the prose sentence and on the bag photo, so they can't be filtered or compared. Keep them as structured tags (the reference data already does this).
- **The country essay repeats** on every Ethiopian coffee and pushes the producer story down. Link to a shared origin page instead.
- **Brew suitability is inconsistent.** Some pages say "Both for filter and espresso" and others don't. Make it a fixed field.
- **A region-select modal** greets first-time visitors on the coffee page. Detect the region quietly instead.

---

## 4. September

- **The parameter list is the hero of the product page.** It's an unstyled `Variety: / Country: / Region: / Process: / Altitude: / Producer: / Farm: / Roast Level:` list, followed by an "In the cup" paragraph with a small tasting icon.
- **Two flavour meters:** **Clean ↔ Funky** and **Terroir ↔ Experimental**, drawn as a rating image between the labels. This is the most original idea in the set. It tells a buyer at a glance whether a Geisha is a classic washed lot or a thermal-shock experiment, without needing to know what "double anaerobic" means. (In the site's code these meters are images, not data, so they're not accessible or filterable. Worth rebuilding as real values.)
- **Typography:** Fraunces (a soft serif) set lowercase for headings ("coffee", "in the cup", "about the producer"), with Figtree for body text. It feels small-batch and friendly.
- **The collection grid** shows country, then "Variety – Process" on separate lines under the name. It's dense and scannable. Sold-out items stay visible with a SOLD OUT badge.
- **Homepage:** only about 2,600px with almost nothing on it (an about paragraph, a subscription pitch, a newsletter signup). The real product is the shop.
- **Weaknesses:** the "Seasoning Coffee" listing (defect beans) and the subscription sit in the same grid as real coffees. Tasting notes exist only as prose.

**Borrow:** the two-axis flavour meters, and parameters shown before the story.

---

## 5. Coffee Collective

- **Calm, readable, plain.** Background `rgb(250, 246, 237)` (warmer than La Cabra), text a brown-grey `rgb(76, 67, 65)`, one grotesk typeface (NB International Pro).
- **The product page** has the name, a one-line character plus notes ("Full-bodied, clean, and sweet. Notes of blackcurrant, blackberry, and rhubarb."), then **About this product**: Origin, Process, Varieties, Altitude, Roast ("roasted for filter"). Then **"Produced together with"** and the producer name with a photo. Then **"15,43 USD/KG: the amount we've chosen to pay based on the quality of the coffee."**
- **Transparency is built into the product,** not hidden in a report. It's a strong trust signal for very little design effort.
- **Navigation splits Filter Coffee and Espresso** as top-level items. That's clear, but the same lot appears twice with no link between the two roasts.
- **"Buy any 4 bags and save 50 DKK"** appears on every coffee listing as a simple, persistent offer.
- **Weakness:** visually generic, with no ownable image system. Product cards show name and price only (no notes, no country).

**Borrow:** the 5-line spec block and the price-paid line.

---

## 6. Phil & Sebastian (your "worse")

Why it feels worse:
- **Shouting typography.** Headings are 54px and uppercase everywhere, including journal and promo blocks, so nothing stands out. The single typeface (Fixture, a condensed grotesk) adds to the density.
- **The homepage is a feed:** about 7,900px of brand statement, Project III, logo coffee, a **Halloween campaign (stale in mid-November)**, New Arrival, Shanghai trip, travel, a "how to choose" guide, best sellers, journal. There's no hierarchy.
- **A pre-sale that's already closed** ("The pre-sale is now closed") is still promoted at the top.
- **About 22 popup/modal containers** in the DOM, which points to layered overlays.

What's still worth stealing:
- **Line-ups explained by packaging:** Core (coloured bags, flavour-profile names like *Lilac Dream*, rotating coffee behind the name), Spotlight (white bags), Uncommon (tins). It's a concrete mental model.
- **Lot codes** (`26ETH06`) on each product, and a full **FACTS** table (Country, Variety, Processing, Site, Station Owner, Exporter, Harvest, Region, Elevation, Drying, Storage: "Green coffee frozen").
- **The tasting-note line** right under the title (JASMINE TEA · PEACH · APRICOT).
- **A founder's first-person letter** on each coffee ("-Phil").
- **Faceted filters** on the coffee page (line-up, roast, country, process, variety).

---

## 7. Monogram (your "worse")

Why it feels worse:
- **Conversion clutter.** "160,000+ ONLINE ORDERS SHIPPED ★★★★★" at the top and "150,000+" further down the same page. Emoji in headings ("Why coffee people choose Monogram 💕"). Checkmark sales lists, testimonials and a "Monogram Special™" block on every product page.
- **Copy tells you what to think** ("Say goodbye to sour light roasts or burnt dark roasts") instead of showing data. There's no altitude, harvest or producer field anywhere.
- **A long homepage** (about 7,700px, 3 videos) with a hero headline animated word by word.

What's still worth stealing:
- **"Flavour Mood" taxonomy:** Chocolatey Comforts, Fruity Classics, Super-Fruity Adventures, Funky Infusions, Dreamy Low/No Caf, Fancy Rarities. It's beginner-friendly navigation, and it doubles as the subscription choice ("Subscribe to the Fruity Classics Playlist").
- **"Want this for espresso?"**, which connects filter and espresso twins of the same coffee. This fixes exactly the problem Coffee Collective has.
- **Product bullets:** Process / Variety / Origin / Tasting Notes, consistent across 45 products.
- **Subscription quantity tiers** on the product page (1 bag 5%, 2 bags 10%, 3 bags 18% off).
- **A full filter sidebar:** Flavour Mood, Roast Type, Processing Method, Country, Variety.

---

## 8. Patterns across all nine sites

| Pattern | Who does it well | Recommendation for Moni |
|---|---|---|
| Spec block near the top (origin, process, variety, altitude, producer) | September, Coffee Collective, Sey, Lab19 | Show 5–6 facts before the story, not in a closed accordion |
| Tasting notes as tags | Phil & Sebastian, Onyx, Monogram | Keep notes structured, and show 3 under the title |
| Tiering or line-ups with explanations | La Cabra, Phil & Sebastian | Name 3–4 tiers and give each one a one-sentence reason |
| Flavour-first navigation | Monogram (moods), September (meters) | Add September-style axes as real data you can filter on, rather than mood names |
| Transparency (price paid, cost breakdown) | Coffee Collective, Onyx, Sey | One line: "We paid X USD/kg (green)" |
| Filter / espresso twins | Monogram links them; Coffee Collective doesn't | One product with a roast toggle, or linked twins |
| Visual identity per coffee | La Cabra (colour + flowers + notes on the label) | Your strongest chance to stand out alongside La Cabra |
| Place / café as content | La Cabra (Chelsea), POMA (research station) | Make the café a homepage section |
| Restraint | POMA, La Cabra, Coffee Collective | Avoid order counters, emoji headings and stale promos |

## 9. Suggested direction for Moni

1. Keep La Cabra's **calm editorial frame** (warm off-white, one serif with one sans, square buttons, large imagery, a colour per coffee).
2. Put **POMA's positioning first:** one sentence about what Moni is, and a few honest numbers.
3. On the listing, use **La Cabra's tiers with reasons**. On each card, add **Phil & Sebastian's three-note line** and **September's Variety – Process line**.
4. On the product page, show the **spec block first** (Coffee Collective / September), then the **two flavour axes** (September, as real data), then **price paid** (Coffee Collective), then the producer story. Brewing advice and shipping can sit in accordions.
5. Handle filter and espresso **as one coffee** with a roast toggle (Monogram's idea, done more simply).


---

## 10. Visual design: Lab19, Sey, POMA (why simple looks good)

Checked 2026-11-14 at 1440×900. The numbers below are measured from the live pages (computed styles, element sizes, pixel positions), not guessed from screenshots. All three look "simple and pretty" for the same underlying reason: **they reduce the number of decisions the eye has to make.** Fewer colours, fewer typefaces, fewer sizes, one repeated card, and everything aligned to a few vertical lines. Each one then adds **one** distinctive idea on top of that calm base.

### 10.1 What each site measures out to

| | Lab19 | Sey | POMA |
|---|---|---|---|
| Page background | Pure white `#FFFFFF` | White | Warm cream `rgb(255,252,243)` |
| Text colours actually used | Black, plus black at 65% for secondary text | Black, plus mid-grey `rgb(133,133,133)` for secondary | **One:** near-black `rgb(19,19,19)` (white only on photos) |
| Accent colours | Coral `rgb(242,130,127)` "Limited" badge, yellow `rgb(251,216,114)` "New" badge | None in the UI. Colour lives only in the coffee images | None. One pale grey `rgb(233,231,223)` for product tiles |
| Typefaces | 2: **Inter** (sans, about 93% of text) + **Lora** (serif, coffee names on the cards) | 2: **GT America Condensed** (all labels, uppercase, tracked +2.1–2.3px) + **GT Super Text** (serif, names and body) | **1:** TWK Lausanne at a single weight |
| Font weights | 400 for almost everything, 500 rarely | Regular only | 400 only. No bold anywhere |
| Body size | 15px | 14–16px | **13px** (small, which reads as precise) |
| Size scale | 10 / 12 / 13 / 15 / 22–24 / 34 / 40px | 12 / 13 / 14 / 16 / 20 / 22px | 13 / 20.3 / 25.4 / 31.7 / 49.6px: an exact **×1.25 ratio** (13 × 1.25² = 20.3, ×1.25⁶ = 49.6) |
| Words on the homepage | ~330 | ~210 | ~340 |
| Homepage length | ~6,300px | ~3,100px | ~4,700px |
| Buttons | Black fill, **square corners**, wide side padding (6px × 30px) | **Outlined**, square, small caps label | **Outlined** hairline (0.67px), square, cream fill |

### 10.2 Lab19: "the product image *is* the spec sheet"

**What you see**
- The homepage opens on a full-bleed photo slider (1425×861) with one serif line on top ("Within the lines, the unknown unwinds."). The logo is centred. The nav is a **tiny stacked list in the top-left corner** (Shop / Lab / Course & Event / Wholesale / About), which keeps the photo uncluttered.
- On scroll, the header shrinks to just a hamburger, the logo and icons.
- **Coffee cards** (the signature): every product image is a flat **colour panel** in a 4:5 portrait ratio (321×402 on the homepage). On it, set in type, are:
  - the coffee name in **Lora serif**, top-left,
  - a single bullet line of tasting notes in small Inter,
  - a **two-column spec table** in the bottom-right (Country / Process / Varietal / Region / Profile),
  - a hairline rule under it.
- The panel colours change per coffee: black for the limited Panama and La Negrita lots, coral, teal, mustard, terracotta, pale pink for the others. Small coral "Limited" and yellow "New" pills (12px, 3px radius) sit in the bottom-left corner.
- Below each card: a tiny grey vendor line ("LAB 19 COFFEE ROASTING"), the product name in 15px, and the price. Nothing else.
- The listing is **5 cards per row** with a row of **outlined filter pills** above it (Roast, Roasting Style, Country, Process, Varietal, Profile, Special, Price). Once you scroll, a **floating "FILTER" button** appears at the bottom centre.
- On the product page, the colour card sits in a large gallery on the left (next to a farm/people photo). The right column is narrow and quiet: name, price, a size pill, an outlined "Add to cart", then a "Description" accordion holding the same ▪Country ▪Process ▪Varietal list.

**Why it looks good**
1. **Information becomes decoration.** There are no bag photos to light, style or match. The type layout *is* the image, so every card is perfectly consistent, and a 5-wide grid of them reads like a set of collectible cards.
2. **Colour is the only variable.** Layout, type, sizes and positions are identical on every card. Only the panel colour changes, so the grid looks lively without looking messy. (I couldn't confirm from the page what the colours mean. My guess is the flavour profile; the black ones do line up with the "Limited" badge.)
3. **The interface around the cards is black and white.** The coloured cards are the only colour on the page apart from two badge colours, so they never compete with UI elements.
4. **Generous outer space with a tight inner grid.** The cards sit close together, but the page margins and the space above each section are large. That makes the grid read as one object.
5. **A serif only where it matters.** Inter does all the work. Lora appears just for coffee names (and the hero line), so the names feel special.

**What to borrow**
- Template your product image as a typographic spec card in brand colours. It's cheap to produce for every new coffee and stays perfectly consistent.
- Keep the UI monochrome so the product colours carry the page.
- Use a floating filter button on long lists.

### 10.3 Sey: "two typefaces, a lot of air, and colour only in the coffee"

**What you see**
- The header is a single thin line: a widely spaced "SEY" logo on the left; COFFEES · SUBSCRIPTIONS · ABOUT · CAFE · WHOLESALE · JOBS in the middle; LOG IN · CART on the right. Everything is **14px uppercase GT America Condensed with 2.1px letter-spacing**.
- The homepage is just 4 blocks, about 3,100px in total:
  1. a full-width coffee-cherry photo with a small white headline "DRINK BEAUTIFUL COFFEE", three lines of serif text and one outlined button,
  2. a centred "OUR APPROACH" paragraph with two text links,
  3. a 50/50 split: subscription text on the left, a photo of the white boxes on the right,
  4. a Spotlight coffee.
  Sections are separated by **single hairline rules**.
- On the coffee listing:
  - a centred title, OUR CURRENT COLLECTION,
  - a short intro paragraph capped at **560px wide** (about 70 characters per line, a comfortable reading length),
  - **3 square cards per row** (330×332), with **75px gaps** and about 142px side margins, so the grid is a calm 1,140px block in the middle of the screen.
- **Each card image is a flat colour square** (raspberry, sky blue, apricot, pink…) with the white SEY box in the middle. The box has a matching colour wave in its corner.
- **The card text is a 4-line stack** that alternates between the two typefaces:
  - *Producer* in 20px serif (Tamiru Tadesse Tesema)
  - FARM in 15px tracked caps (SAFO)
  - VARIETY - PROCESS in tracked caps (74158 - WASHED)
  - *Country* in 20px serif (Ethiopia)
- The product page uses the same stack beside a large colour-square image, then a short paragraph, a size/price dropdown, quantity and an outlined ADD TO CART. Below the image, a **two-column spec table** (tracked-caps labels on the left, serif values on the right): Varietal, Region, Altitude, Harvest, Processing.

**Why it looks good**
1. **Strict typographic contrast.** One condensed, uppercase, tracked sans for *labels*. One soft serif for *names and prose*. Every line on the site is one or the other. That rhythm (caps, serif, caps, serif) gives order without any boxes, borders or icons.
2. **Colour lives only in the coffee.** The interface is black, white and one grey. The only saturated colours are the per-coffee squares, so the listing looks like a palette.
3. **Big gaps.** 75px between cards and wide margins. The grid is narrower than the screen, so it feels curated rather than crowded.
4. **Square images, centred product.** Every image has the same square shape, the same centred box, the same flat background. Repetition reads as calm.
5. **Very little copy.** About 210 words on the homepage. The craft is implied by the restraint.

**What to borrow**
- A strict two-typeface system: caps for labels, a serif for names.
- One flat colour per coffee as the product image background.
- A 3-column grid capped at about 1,140px with large gaps.
- The producer / farm / variety–process / country stack as the card text.

### 10.4 POMA: "a lab report on a cream page"

**What you see**
- The header is a single 43px line on cream: the "POMA" wordmark on the left, five 13px links in the middle (Research · Coffee · Publications · Advisory · About), Login · Cart on the right. No icons, no bar colour, no shadow.
- **The hero is a full-bleed photograph** (1399×829) of hands holding coffee cherries. Its only overlay is a tiny **monospace caption, like a lab label**: "TRIAL C8-011 / FRUIT PIGMENTATION / CATURRA / VOLCAN AZUL, COSTA RICA / ACTIVE SINCE 2023". No headline sits on the photo.
- Under the photo, the **mission sentence is the headline**: about 32px, set in a block about half the page wide. Then a "Research Overview" label and **four big numbers in a row** (34 / 12 / 11 / 14, at 49.6px). Each sits under a 10px label (Active Trials, Partner Farms, Countries, Publications), with thin vertical rules between them.
- **Current Menu** is 4 equal square tiles (329×329) on a pale grey `rgb(233,231,223)` with the bag centred. Below each tile, the name sits on the left and "from $32.00" on the right, on one line. Thin vertical hairlines separate the columns.
- **Publications** use the same 4-column grid, with photos instead of bags.
- Measured left edges cluster at **13, 369, 726 and 1,082px**. That's a strict **4-column grid with a 13px outer margin**: every block snaps to it.
- The product page splits **half and half**:
  - Left: a stack of large square images (686×686) that scrolls.
  - Right: a **sticky** 468px column with a small "Research Collection" eyebrow, the name at 25.4px, the description, price, size pills, quantity, a hairline-outlined "Add to cart →", "Coffee is roasted every Tuesday", "DHL Express within 1-3 days from Denmark".
  - Further down: story paragraphs and a plain **Technical Data** list.

**Why it looks good**
1. **One typeface, one weight, one colour.** Hierarchy comes **only from size and space**. Five sizes on a strict ×1.25 ratio means every step looks deliberate. No bold, no colour, no caps tricks are needed.
2. **A visible grid.** Four columns, a 13px margin, hairline column rules. Everything from the stats to the menu to the publications sits on the same lines, which makes the page feel engineered, matching the "research company" story.
3. **Photography does the emotion, typography does the facts.** Photos are big and full-bleed with almost nothing on them. Text blocks have no images inside them. The two never fight.
4. **Lab details as decoration.** The monospace trial caption and the stat row carry the brand's "science" voice through small details, without any illustration or iconography.
5. **Warm neutrals instead of pure white.** The cream background and pale grey tiles soften a very rigid layout so it doesn't feel cold.
6. **A small menu.** Only 4 coffees are on the public menu, so the grid is never crowded.

The one break in the system: the purple Shop Pay button on the product page, from Shopify's express checkout, is the only saturated colour on the site and clashes with it. Hide it or restyle it if you use Shopify.

**What to borrow**
- One typeface, regular weight, a ×1.25 size scale.
- A fixed column grid with hairline dividers.
- Lab-style monospace captions on photos (a lot code, farm, process, date).
- A sticky buy column next to a scrolling image column.
- A cream background with grey product tiles.

### 10.5 The common causes of "simple, pretty, straightforward"

| Cause | Lab19 | Sey | POMA | Rule of thumb for Moni |
|---|---|---|---|---|
| Few colours in the UI | B/W + 2 badges | B/W + grey | 1 near-black on cream | The UI uses 1–2 neutrals; let the coffees bring the colour |
| Few typefaces and weights | 2 faces, mostly 400 | 2 faces, regular only | 1 face, 400 only | Max 2 faces, 1–2 weights |
| A consistent size scale | ~7 sizes | ~6 sizes | 5 sizes, exact ×1.25 | Pick a ratio (1.2–1.25) and use only those steps |
| One repeated card | Typographic 4:5 colour card | Square colour field + text stack | Square grey tile + 1-line caption | Design one card and never vary its layout |
| Images with no clutter on them | Info is part of the image, by design | Flat colour + product only | Full-bleed photos, tiny caption | No text boxes or badges piled on photos |
| Visible alignment | 5-column grid, filter pills | Centred 1,140px grid, 75px gaps | 4-column grid, 13px margin, hairlines | Choose one grid and snap everything to it |
| Lots of space, little copy | ~330 words | ~210 words | ~340 words | Homepage under ~400 words |
| Quiet controls | Square black buttons, outlined pills | Outlined caps buttons | Hairline outlined buttons | Square or near-square, outlined or single-colour; no gradients or shadows |
| One signature idea | Spec-sheet cards | Caps/serif rhythm + colour squares | Lab captions + stats row | Choose one signature and repeat it everywhere |

**In one sentence:** these sites look simple because they keep **colour, type and layout constant** and let **only the coffee** (its colour, its name, its facts) change from card to card.

### 10.6 How this combines with La Cabra for Moni

La Cabra (closest to Moni today) already has the calm palette and the one-colour-per-coffee idea, but delivers it through photographs. The three sites above suggest how to make it **simpler and more ownable**:
- Keep La Cabra's warm off-white, but go down to **one text colour** (POMA) and **two typefaces with a strict caps/serif split** (Sey).
- Replace styled photography in the grid with a **flat colour field per coffee** (Sey) or a **typographic spec card** (Lab19). Keep photos for the hero and the producer stories.
- Put the facts on a **fixed grid with hairline dividers** (POMA) instead of inside accordions.
- Choose **one signature detail**, for example a monospace lot label (POMA) or a printed spec table (Lab19), and repeat it on every coffee.
