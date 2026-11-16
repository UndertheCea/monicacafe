import { Button, Card } from "@/components/ui";
import { t, type Locale } from "@/lib/i18n/dict";

/** Shown instead of an "empty" message when ?page= is beyond the last page (#334). */
export function PastLastPage({ locale, href }: { locale: Locale; href: string }) {
  return (
    <Card className="p-10 text-center text-muted">
      <p>{t(locale, "page.past")}</p>
      <Button href={href} variant="secondary" className="mt-4">
        {t(locale, "page.backToFirst")}
      </Button>
    </Card>
  );
}
