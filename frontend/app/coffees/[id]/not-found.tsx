import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { NotFoundState } from "@/components/ErrorState";

export default async function CoffeeNotFound() {
  const locale = await getLocale();
  return (
    <NotFoundState
      title={t(locale, "coffee.notFound")}
      body={t(locale, "coffee.notFoundBody")}
      backHref="/coffees"
      backLabel={t(locale, "coffee.back")}
    />
  );
}
