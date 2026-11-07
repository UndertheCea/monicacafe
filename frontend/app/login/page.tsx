import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "auth.loginTitle"), robots: { index: false } };
}

export default async function LoginPage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-stone-900">{t(locale, "auth.loginTitle")}</h1>
      <p className="mt-1 text-stone-600">{t(locale, "auth.loginSub")}</p>
      <div className="mt-6">
        {/* useSearchParams() needs a Suspense boundary for static rendering. */}
        <Suspense>
          <AuthForm mode="login" locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
