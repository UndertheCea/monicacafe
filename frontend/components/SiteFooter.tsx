import { t, type Locale } from "@/lib/i18n/dict";
import { Wordmark } from "./Wordmark";

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-neutral-200 bg-white px-4 py-10 text-sm text-neutral-500">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Wordmark size="sm" />
        <p>{t(locale, "footer.copy", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
