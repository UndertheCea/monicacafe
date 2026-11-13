import type { CoffeeCardData } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { CoffeeCard } from "./CoffeeCard";
import { SectionTitle } from "@/components/ui";

/** Similar coffees from other shops below a coffee page; hidden when there are none. */
export function AlsoLike({ coffees, locale }: { coffees: CoffeeCardData[]; locale: Locale }) {
  if (coffees.length === 0) return null;
  return (
    <section aria-labelledby="also-like" className="mt-12">
      <SectionTitle id="also-like" className="mb-4">
        {t(locale, "coffee.alsoLike")}
      </SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {coffees.map((c) => (
          <CoffeeCard key={c.id} coffee={c} locale={locale} />
        ))}
      </div>
    </section>
  );
}
