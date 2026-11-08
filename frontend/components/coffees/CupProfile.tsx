import { CUP_MAX, cupScalesOf, type CupScale } from "@/lib/cupProfile";
import { t, type Locale } from "@/lib/i18n/dict";

const STEPS = Array.from({ length: CUP_MAX }, (_, i) => i + 1);

/**
 * Acidity / sweetness / body as five black-and-white steps each (only the
 * scales the seller set). Screen readers get "Acidity 2 of 5".
 */
export function CupProfile({
  coffee,
  locale,
}: {
  coffee: Partial<Record<CupScale, number | null>>;
  locale: Locale;
}) {
  const scales = cupScalesOf(coffee);
  if (scales.length === 0) return null;
  return (
    <section className="mt-6" aria-labelledby="cup-heading">
      <h2 id="cup-heading" className="text-sm font-semibold text-neutral-700">
        {t(locale, "cup.title")}
      </h2>
      <dl className="mt-2 space-y-2">
        {scales.map(({ scale, value }) => {
          const label = t(locale, `cup.${scale}`);
          return (
            <div key={scale} className="flex items-center gap-4">
              <dt className="w-16 shrink-0 text-sm text-neutral-600">{label}</dt>
              <dd className="flex gap-1" role="img" aria-label={t(locale, "cup.value", { scale: label, n: value, max: CUP_MAX })}>
                {STEPS.map((step) => (
                  <span
                    key={step}
                    aria-hidden="true"
                    className={`h-2.5 w-8 rounded-sm ${step <= value ? "bg-ink" : "bg-white ring-1 ring-inset ring-neutral-300"}`}
                  />
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
