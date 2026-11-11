"use client";

import Link from "next/link";
import { useEffect } from "react";
import { t } from "@/lib/i18n/dict";
import { useHtmlLocale } from "@/lib/i18n/useLocale";
import { Page } from "@/components/Page";

/**
 * Error boundary for every page below the root layout: a render error shows a
 * bilingual panel with a retry instead of Next's bare error screen. Data-fetch
 * failures in server components are already handled by <ErrorState>.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useHtmlLocale();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page className="py-24">
    <div className="mx-auto max-w-3xl">
      <div role="alert" className="rounded-2xl bg-danger/10 p-6 ring-1 ring-danger/30">
        <h1 className="text-lg font-bold text-danger">{t(locale, "crash.title")}</h1>
        <p className="mt-2 text-danger">{t(locale, "crash.body")}</p>
        <div className="mt-4 flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-danger px-4 py-1.5 font-semibold text-white hover:bg-danger/80"
          >
            {t(locale, "crash.retry")}
          </button>
          <Link href="/" className="font-medium text-danger hover:underline">
            {t(locale, "notFound.home")}
          </Link>
        </div>
      </div>
    </div>
    </Page>
  );
}
