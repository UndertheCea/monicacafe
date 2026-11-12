// Presentational helpers shared by the seller dashboard pages. The form primitives live in components/ui (#230);
// they are re-exported here so dashboard files have one import.
import { Button, Card } from "@/components/ui";
import { t, type Locale } from "@/lib/i18n/dict";

export { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
export { FormError } from "./FormError";

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Card as="p" className="p-6 text-center text-muted">
      {children}
    </Card>
  );
}

export function LoginNeeded({ locale, next }: { locale: Locale; next: string }) {
  return (
    <Card className="p-6 text-center">
      <p className="text-muted">{t(locale, "dash.loginNeeded")}</p>
      <Button href={`/login?next=${encodeURIComponent(next)}`} className="mt-4">
        {t(locale, "nav.login")}
      </Button>
    </Card>
  );
}
