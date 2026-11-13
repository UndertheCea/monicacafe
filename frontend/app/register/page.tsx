import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { Page } from "@/components/Page";
import { PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "auth.registerTitle"), robots: { index: false } };
}

export default async function RegisterPage() {
  const locale = await getLocale();
  return (
    <Page className="py-12">
    <div className="mx-auto max-w-md">
      <PageTitle>{t(locale, "auth.registerTitle")}</PageTitle>
      <p className="mt-1 text-muted">{t(locale, "auth.registerSub")}</p>
      <div className="mt-6">
        {/* useSearchParams() needs a Suspense boundary for static rendering. */}
        <Suspense>
          <AuthForm mode="register" locale={locale} />
        </Suspense>
      </div>
    </div>
    </Page>
  );
}
