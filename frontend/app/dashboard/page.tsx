import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { Page } from "@/components/Page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "dash.title"), robots: { index: false } };
}

// The dashboard is client-rendered: the access token lives only in the
// browser (see components/auth/AuthProvider.tsx).
export default async function DashboardPage() {
  const locale = await getLocale();
  return (
    <Page className="py-10">
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-3xl font-bold text-ink">{t(locale, "dash.title")}</h1>
      <Dashboard locale={locale} />
    </div>
    </Page>
  );
}
