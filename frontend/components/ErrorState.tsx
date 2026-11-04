import Link from "next/link";
import { toApiError } from "@/lib/graphql";
import { pick, t, type Locale } from "@/lib/i18n/dict";

/** Bilingual error panel for a failed GraphQL fetch in a server component. */
export function ErrorState({ locale, error }: { locale: Locale; error: unknown }) {
  const e = toApiError(error);
  return (
    <main className="mx-auto max-w-3xl px-4 py-24">
      <div role="alert" className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
        <h1 className="text-lg font-bold text-red-900">{t(locale, "error.title")}</h1>
        <p className="mt-2 text-red-800">{pick(locale, e.messageZh, e.messageEn)}</p>
        <p className="mt-1 text-sm text-red-700">{t(locale, "error.retry")}</p>
      </div>
    </main>
  );
}

/** Bilingual "not found" panel with a link back to a listing page. */
export function NotFoundState({
  title,
  body,
  backHref,
  backLabel,
}: {
  title: string;
  body: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p aria-hidden className="text-5xl">
        ☕
      </p>
      <h1 className="mt-4 text-2xl font-bold text-stone-900">{title}</h1>
      <p className="mt-2 text-stone-600">{body}</p>
      <Link href={backHref} className="mt-6 inline-block text-sm font-medium text-amber-700 hover:underline">
        {backLabel}
      </Link>
    </main>
  );
}
