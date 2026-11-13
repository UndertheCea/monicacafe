import type { Metadata } from "next";
import { AdminScreen } from "@/components/admin/AdminScreen";
import { Page } from "@/components/Page";
import { PageTitle } from "@/components/ui";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "admin.title"), robots: { index: false, follow: false } };
}

// Client-rendered like the dashboard: the access token lives only in the
// browser. The screen shows itself to admins only, and the API refuses every
// admin field to anyone else (the role is re-read from the database).
export default async function AdminPage() {
  const locale = await getLocale();
  return (
    <Page className="py-10">
      <PageTitle className="mb-6">{t(locale, "admin.title")}</PageTitle>
      <AdminScreen locale={locale} />
    </Page>
  );
}
