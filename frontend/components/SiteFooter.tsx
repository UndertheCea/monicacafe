import { t, type Locale } from "@/lib/i18n/dict";
import { Wordmark } from "./Wordmark";
import { Page } from "@/components/Page";

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-line bg-white py-10 text-sm text-muted">
      <Page className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Wordmark size="sm" />
        <p>{t(locale, "footer.copy", { year: new Date().getFullYear() })}</p>
      </Page>
    </footer>
  );
}
