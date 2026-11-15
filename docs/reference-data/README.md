# Reference data

Coffee lists the owner collected from nine well-known roasters on 2026-11-13 (their sites can't be reached
from the build sessions, #168 (b)). Each file is a JSON array of `reference_catalogue` fields plus an
"Uncertain / notes" list with the judgement calls made while copying.

`scripts/seed_reference.sql` loads each array verbatim with `reference_add('<slug>', …)` (dev only,
`SEED_REFERENCE_SHOPS=true`). To refresh a roaster, replace its array in both places.

| File | Shop | Coffees | Slice |
|---|---|---|---|
| `170-lab19-reference.md` | Lab19 | 21 | #170 |
| `171-sey-reference.md` | SEY | 9 | #171 |
| `172-poma-reference.md` | Poma | 18 | #172 |
| `173-onyx-reference.md` | Onyx | 33 | #173 |
| `new-coffeecollective-reference.md` | Coffee Collective | 12 | #299 |
| `new-lacabra-reference.md` | La Cabra (US) | 8 | #300 |
| `new-september-reference.md` | September | 15 | #301 |
| `new-philsebastian-reference.md` | Phil & Sebastian | 20 | #302 |
| `new-monogram-reference.md` | Monogram | 45 | #303 |

`./scripts/reference_gaps.sh` lists raw values our tables don't match. After #174 it is empty apart from
eight reviewed, "accepted" gaps (multi-country blends, lots that print no country or process, Poma's
Danish research station); 159 of the 181 coffees load.
