import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { NotFoundState } from "@/components/ErrorState";

export default async function ShopNotFound() {
  const locale = await getLocale();
  return (
    <NotFoundState
      title={t(locale, "shops.notFound")}
      body={t(locale, "shops.notFoundBody")}
      backHref="/shops"
      backLabel={t(locale, "shops.back")}
    />
  );
}
