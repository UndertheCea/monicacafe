// Small presentational helpers shared by the seller dashboard pages.
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/dict";

export const inputCls =
  "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none focus:border-ink focus:ring-2 focus:ring-line";

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-white p-6 text-center text-muted ring-1 ring-line">{children}</p>;
}

export function LoginNeeded({ locale, next }: { locale: Locale; next: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-line">
      <p className="text-muted">{t(locale, "dash.loginNeeded")}</p>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/80"
      >
        {t(locale, "nav.login")}
      </Link>
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-danger/30">
      {children}
    </p>
  );
}
