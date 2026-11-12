import Link from "next/link";
import type { CoffeeDetail } from "@/lib/api";
import { brewLongKey } from "@/lib/brew";
import { flavorNoteHref } from "@/lib/coffeeQuery";
import { knownHarvestYear } from "@/lib/harvest";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { coffeeAvailability, pricePer100g } from "@/lib/pricing";
import { originLine, provenanceFacts } from "@/lib/provenance";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "./CoffeeTile";
import { PhotoGallery } from "./PhotoGallery";
import { ShopLogo } from "@/components/shops/ShopLogo";
import { Badge, Button, Card, Label, PageTitle, SectionTitle } from "@/components/ui";
import { CARD } from "@/lib/ui";

/**
 * The body of a coffee page: images, facts, flavour notes, description,
 * options and seller. Pure render (no data fetching, no hooks), so the public
 * server page and the seller's client-side draft preview share it.
 */
export function CoffeeDetailView({
  coffee,
  locale,
  actions,
}: {
  coffee: CoffeeDetail;
  locale: Locale;
  /** Shown under the name (the public page's save button; the draft preview has none). */
  actions?: React.ReactNode;
}) {
  const facts: [string, string][] = [
    [t(locale, "coffee.origin"), pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn)],
    [t(locale, "coffee.process"), pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)],
  ];
  if (coffee.roastLevel) facts.push([t(locale, "coffee.roast"), t(locale, `roast.${coffee.roastLevel}`)]);
  const brew = brewLongKey(coffee.brewMethod);
  if (brew) facts.push([t(locale, "coffee.brew"), t(locale, brew)]);
  if (coffee.variety) facts.splice(1, 0, [t(locale, "coffee.variety"), coffee.variety.name]);
  // Producer / region / altitude follow the origin facts, only when set.
  for (const [key, value] of provenanceFacts(coffee)) facts.push([t(locale, key), value]);
  const harvest = knownHarvestYear(coffee.harvestYear);
  if (harvest) facts.push([t(locale, "coffee.harvest"), t(locale, "coffee.harvestValue", { year: harvest })]);

  const availability = coffeeAvailability(coffee.variants);

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-2">
      {/* Images */}
      <PhotoGallery
        images={coffee.imageUrls}
        name={coffee.name}
        locale={locale}
        placeholder={
          <CoffeeTile
            size="hero"
            id={coffee.id}
            name={coffee.name}
            variety={coffee.variety?.name}
            process={pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)}
            origin={originLine({
              region: coffee.region,
              country: pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn),
            })}
          />
        }
      />

      {/* Details */}
      <div>
        {!coffee.isPublished && (
          <p className="mb-3">
            <Badge tone="soft">{t(locale, "coffee.draft")}</Badge>
          </p>
        )}
        <p className="text-sm text-muted">
          <Link href={`/shops/${coffee.shop.slug}`} className="hover:text-ink hover:underline underline-offset-4">
            {coffee.shop.name}
          </Link>
          {coffee.shop.city && ` · ${coffee.shop.city}`}
        </p>
        <PageTitle className="mt-1">{coffee.name}</PageTitle>
        {availability.kind === "from" && (
          <p className="mt-2 text-xl font-semibold text-ink">
            {t(locale, "coffees.from", { price: formatTWD(availability.price) })}
            {availability.per100g !== null && (
              <span className="ml-2 text-sm font-normal text-muted">
                {t(locale, "coffee.per100g", { price: formatTWD(availability.per100g) })}
              </span>
            )}
          </p>
        )}
        {availability.kind === "soldOut" && (
          <p className="mt-2 text-xl font-semibold text-ink">{t(locale, "coffee.soldOutHeadline")}</p>
        )}
        {actions}

        <Card as="dl" className="mt-6 grid grid-cols-2 gap-4 p-5">
          {facts.map(([label, value]) => (
            <div key={label}>
              <Label as="dt">{label}</Label>
              <dd className="mt-0.5 break-words font-medium text-ink">{value}</dd>
            </div>
          ))}
        </Card>


        {coffee.flavorNotes.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink">{t(locale, "coffee.flavorNotes")}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {coffee.flavorNotes.map((note) => (
                <li key={note}>
                  <Link
                    href={flavorNoteHref(note)}
                    className="inline-block rounded-full bg-white px-3 py-1 text-sm text-ink ring-1 ring-line hover:bg-paper"
                  >
                    {note}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {coffee.description && (
          <p className="mt-6 whitespace-pre-line leading-relaxed text-ink">{coffee.description}</p>
        )}

        <section className="mt-8" aria-labelledby="variants-heading">
          <SectionTitle id="variants-heading">
            {t(locale, "coffee.variants")}
          </SectionTitle>
          {coffee.variants.length === 0 ? (
            <p className="mt-2 text-muted">{t(locale, "coffee.noVariants")}</p>
          ) : (
            <table className={`${CARD} mt-3 w-full overflow-hidden text-left text-sm`}>
              <thead className="bg-paper text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t(locale, "coffee.grind")}</th>
                  <th className="px-4 py-2 font-medium">{t(locale, "coffee.weight")}</th>
                  <th className="px-4 py-2 font-medium">{t(locale, "coffee.price")}</th>
                  <th className="px-4 py-2 font-medium">{t(locale, "coffee.stock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {coffee.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2">{t(locale, `grind.${v.grind}`)}</td>
                    <td className="px-4 py-2">{v.weightG} g</td>
                    <td className="px-4 py-2">
                      <span className="font-semibold">NT${formatTWD(v.priceTwd)}</span>
                      <Per100g locale={locale} priceTwd={v.priceTwd} weightG={v.weightG} />
                    </td>
                    <td className={v.isAvailable ? "px-4 py-2" : "px-4 py-2 text-muted"}>
                      {v.isAvailable ? t(locale, "coffee.inStock", { n: v.stock }) : t(locale, "coffees.soldOut")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* Stage 1 is discovery only — cart & ECPay checkout land in Stage 2. */}
          <p className="mt-3 rounded-box bg-paper px-4 py-3 text-sm text-muted">
            {t(locale, "coffee.checkoutSoon")}
          </p>
        </section>

        <Card as="aside" className="mt-8 flex items-center gap-4 p-4">
          <ShopLogo name={coffee.shop.name} logoUrl={coffee.shop.logoUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t(locale, "coffee.soldBy")}</p>
            <p className="truncate font-semibold text-ink">{coffee.shop.name}</p>
          </div>
          <Button
            href={`/shops/${coffee.shop.slug}`}
            variant="secondary" className="shrink-0"
          >
            {t(locale, "coffee.visitShop")}
          </Button>
        </Card>
      </div>
    </div>
  );
}

/** "NT$X / 100 g" under a variant price; nothing for 100 g bags or bad weights. */
function Per100g({ locale, priceTwd, weightG }: { locale: Locale; priceTwd: number; weightG: number }) {
  const per100 = pricePer100g(priceTwd, weightG);
  if (per100 === null || weightG === 100) return null;
  return (
    <span className="block text-xs font-normal text-muted">
      {t(locale, "coffee.per100g", { price: formatTWD(per100) })}
    </span>
  );
}
