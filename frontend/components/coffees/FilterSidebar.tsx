import {
  type CoffeeFilter,
  type CoffeeVariety,
  type Counted,
  type OriginCountry,
  type ProcessingMethod,
} from "@/lib/api";
import { SEARCH_MAX_CHARS, SORT_PARAMS, type SortParam } from "@/lib/coffeeQuery";
import { groupByRegion, optionsWithCoffees } from "@/lib/filterOptions";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { Button, Input, Label, Select } from "@/components/ui";
import { CARD, LABEL } from "@/lib/ui";

interface Props {
  locale: Locale;
  filter: CoffeeFilter;
  sort: SortParam;
  origins: Counted<OriginCountry>[];
  varieties: Counted<CoffeeVariety>[];
  methods: Counted<ProcessingMethod>[];
}

// Plain GET form: works without JavaScript and keeps filters in the URL.
// Only origin / variety / process / price / in stock (owner, #166): each shop
// rates cup profile, roast and brew by its own standard, so those aren't
// compared across shops here.
export function FilterSidebar({ locale, filter, sort, origins, varieties, methods }: Props) {
  // Only values with published coffees (plus whatever the URL selects), with
  // their counts; origins in an <optgroup> per continent.
  const regions = groupByRegion(optionsWithCoffees(origins, filter.originCountryId));
  const shownVarieties = optionsWithCoffees(varieties, filter.varietyId);
  const shownMethods = optionsWithCoffees(methods, filter.processingMethodId);
  const counted = (name: string, n: number) => t(locale, "filter.optionCount", { name, n });

  return (
    <form method="get" action="/coffees" className={`${CARD} space-y-5 p-5 group-open:p-0 group-open:ring-0`}>
      {/* Below md the drawer (or the no-JS toggle) already says "Filters". */}
      <h2 className="hidden text-base font-bold text-ink md:block">{t(locale, "filter.title")}</h2>

      <label className="block">
        <Label as="span" className="block">{t(locale, "filter.search")}</Label>
        <Input
          search
          type="search"
          name="q"
          defaultValue={filter.search ?? ""}
          placeholder={t(locale, "filter.searchPlaceholder")}
          maxLength={SEARCH_MAX_CHARS}
          className="mt-1"
        />
      </label>

      <label className="block">
        <Label as="span" className="block">{t(locale, "sort.label")}</Label>
        <Select name="sort" defaultValue={sort} className="mt-1">
          {SORT_PARAMS.map((p) => (
            <option key={p || "newest"} value={p}>
              {t(locale, `sort.${p || "newest"}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <Label as="span" className="block">{t(locale, "filter.origin")}</Label>
        <Select name="origin" defaultValue={filter.originCountryId ?? ""} className="mt-1">
          <option value="">{t(locale, "filter.any")}</option>
          {regions.map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {counted(pick(locale, `${o.nameZh} ${o.nameEn}`, o.nameEn), o.coffeeCount)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      <label className="block">
        <Label as="span" className="block">{t(locale, "filter.variety")}</Label>
        <Select name="variety" defaultValue={filter.varietyId ?? ""} className="mt-1">
          <option value="">{t(locale, "filter.any")}</option>
          {shownVarieties.map((v) => (
            <option key={v.id} value={v.id}>
              {counted(v.name, v.coffeeCount)}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <Label as="span" className="block">{t(locale, "filter.process")}</Label>
        <Select name="process" defaultValue={filter.processingMethodId ?? ""} className="mt-1">
          <option value="">{t(locale, "filter.any")}</option>
          {shownMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {counted(pick(locale, `${m.nameZh} ${m.nameEn}`, m.nameEn), m.coffeeCount)}
            </option>
          ))}
        </Select>
      </label>

      <fieldset>
        <legend className={LABEL}>{t(locale, "filter.price")}</legend>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            name="min"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={filter.minPriceTwd ?? ""}
            placeholder={t(locale, "filter.min")}
            aria-label={t(locale, "filter.min")}
          />
          <span className="text-faint">–</span>
          <Input
            type="number"
            name="max"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={filter.maxPriceTwd ?? ""}
            placeholder={t(locale, "filter.max")}
            aria-label={t(locale, "filter.max")}
          />
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="instock"
          value="1"
          defaultChecked={filter.inStock === true}
          className="h-4 w-4 accent-ink"
        />
        {t(locale, "filter.inStock")}
      </label>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          {t(locale, "filter.apply")}
        </Button>
        <Button href="/coffees" variant="secondary">
          {t(locale, "filter.reset")}
        </Button>
      </div>
    </form>
  );
}
