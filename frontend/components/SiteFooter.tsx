import { t, type Locale } from "@/lib/i18n/dict";

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
      {t(locale, "footer.copy", { year: new Date().getFullYear() })}
    </footer>
  );
}
