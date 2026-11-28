import { t, type Locale } from "@/lib/i18n/dict";

/**
 * Shown only without JavaScript, on the pages that render nothing but a
 * loading line until the browser's session is known (cart, account,
 * dashboard, admin; #570). Without it those pages said "Loading…" forever.
 */
export function NeedsJs({ locale }: { locale: Locale }) {
  return (
    <noscript>
      <p className="mb-4 text-sm text-danger">{t(locale, "common.needsJs")}</p>
    </noscript>
  );
}
