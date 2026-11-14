Reference data collected locally on 2026-11-13 for #168 (option b).

_La Cabra (US) — not yet tied to a GitHub issue (no issue number given for this shop)._

```json
[
 {
  "coffee_name": "Haji Bule",
  "origin_raw": "Ethiopia",
  "variety_raw": "Heirloom",
  "process_raw": "Washed",
  "producer": "Bette Buna",
  "region": "Guji",
  "altitude_min_m": 2100,
  "altitude_max_m": null,
  "harvest_year": 2025,
  "roast_level": null,
  "brew_method": "OMNI",
  "flavor_notes": [
   "jasmine",
   "black tea",
   "apricot"
  ],
  "source_url": "https://us.lacabra.com/products/haji-bule",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Megadu",
  "origin_raw": "Ethiopia",
  "variety_raw": "Heirloom",
  "process_raw": "Natural",
  "producer": "Bette Buna",
  "region": "Guji",
  "altitude_min_m": 2100,
  "altitude_max_m": null,
  "harvest_year": 2025,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [
   "brown sugar",
   "blackberry jam",
   "apricot"
  ],
  "source_url": "https://us.lacabra.com/products/megadu",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Las Flores de Cafe",
  "origin_raw": "Guatemala",
  "variety_raw": "Caturra, Catuai, Bourbon",
  "process_raw": "Washed",
  "producer": "Huehue smallholders",
  "region": "Huehuetenango",
  "altitude_min_m": 1650,
  "altitude_max_m": null,
  "harvest_year": 2026,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [
   "soft red berries",
   "sweet dark chocolate"
  ],
  "source_url": "https://us.lacabra.com/products/las-flores-de-cafe",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Kiangoi",
  "origin_raw": "Kenya",
  "variety_raw": "SL28, SL34, Ruiru 11",
  "process_raw": "Washed",
  "producer": "Rungeto FCS",
  "region": "Kirinyaga",
  "altitude_min_m": 1800,
  "altitude_max_m": null,
  "harvest_year": 2025,
  "roast_level": null,
  "brew_method": "OMNI",
  "flavor_notes": [
   "redcurrant",
   "hibiscus"
  ],
  "source_url": "https://us.lacabra.com/products/kiangoi",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Chevas Washed",
  "origin_raw": "Panama",
  "variety_raw": "Geisha",
  "process_raw": "Washed",
  "producer": "José Luis Chevas / Chevas Coffee Estate",
  "region": "El Salto, Boquete, Chiriquí",
  "altitude_min_m": 1500,
  "altitude_max_m": 1750,
  "harvest_year": 2026,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [
   "hibiscus",
   "peach",
   "orange zest"
  ],
  "source_url": "https://us.lacabra.com/products/chevas-washed",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Esmeralda",
  "origin_raw": "Panama",
  "variety_raw": "Geisha",
  "process_raw": "Washed",
  "producer": "The Peterson Family / Hacienda La Esmeralda",
  "region": "Boquete, Panama",
  "altitude_min_m": 1700,
  "altitude_max_m": null,
  "harvest_year": 2026,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [
   "Meyer lemon",
   "white peach",
   "jasmine"
  ],
  "source_url": "https://us.lacabra.com/products/esmeralda",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "La Divina",
  "origin_raw": "El Salvador",
  "variety_raw": "Geisha",
  "process_raw": "Anaerobic Natural",
  "producer": "Roberto Ulloa",
  "region": "Apaneca-Ilamatepec, El Salvador",
  "altitude_min_m": 1550,
  "altitude_max_m": 1830,
  "harvest_year": 2026,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [
   "green apple",
   "chocolate"
  ],
  "source_url": "https://us.lacabra.com/products/la-divina",
  "checked_on": "2026-11-13"
 },
 {
  "coffee_name": "Herbazu",
  "origin_raw": "Costa Rica",
  "variety_raw": "SL28",
  "process_raw": "Honey",
  "producer": "Barrantes Brothers",
  "region": "West Valley",
  "altitude_min_m": 1900,
  "altitude_max_m": null,
  "harvest_year": 2026,
  "roast_level": null,
  "brew_method": null,
  "flavor_notes": [],
  "source_url": "https://us.lacabra.com/products/herbazu",
  "checked_on": "2026-11-13"
 }
]
```

**Uncertain / notes**
- Source: `us.lacabra.com/collections/coffee` (products.json, 8 coffees) plus each product page's "Technical Data" accordion (Producer, Region, Altitude, Varietal, Process, Harvest).
- Skipped: Profiles subscription (Luna / Terra rotating-lot profiles), Rituals subscription, Christmas Calendar (24 coffees) and Advent Calendar. Single-serve coffees, bundles, Würtz ceramics, equipment, chocolate and gift cards are not coffee beans.
- Flavor notes come from the one-line description (e.g. "jasmine, black tea and apricot notes"); La Cabra has no separate tasting-notes field. Herbazu's description gives no notes, so `[]`.
- `harvest_year` from the Harvest line (e.g. "December 2025" -> 2025; La Divina just says "2026").
- `brew_method` OMNI only where the page says so: Haji Bule ("Both for filter and espresso") and Kiangoi ("for all brew methods"). The others were not checked for that line, so `null`.
- Roast level is not stated (`null`). The US site was used; the Danish site may list different coffees.
