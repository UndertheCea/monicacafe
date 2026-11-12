import Link from "next/link";
import { loadErrorKey } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { Page } from "@/components/Page";
import { PageTitle } from "@/components/ui";

/** Bilingual error panel for a failed GraphQL fetch in a server component. */
export function ErrorState({ locale, error }: { locale: Locale; error: unknown }) {
  const e = toApiError(error);
  return (
    <Page className="py-24">
    <div className="mx-auto max-w-3xl">
      <div role="alert" className="rounded-box bg-danger/10 p-6 ring-1 ring-danger/30">
        <h1 className="text-lg font-bold text-danger">{t(locale, "error.title")}</h1>
        <p className="mt-2 text-danger">{t(locale, loadErrorKey(e.code))}</p>
      </div>
    </div>
    </Page>
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
    <Page className="py-24 text-center">
    <div className="mx-auto max-w-3xl">
      <PageTitle className="mt-4">{title}</PageTitle>
      <p className="mt-2 text-muted">{body}</p>
      <Link href={backHref} className="mt-6 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">
        {backLabel}
      </Link>
    </div>
    </Page>
  );
}
