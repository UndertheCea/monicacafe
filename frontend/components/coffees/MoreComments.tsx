"use client";

import { useState } from "react";
import { COFFEE_COMMENTS, type CommentData } from "@/lib/api";
import { COMMENTS_PAGE, appendComments, hasMoreComments } from "@/lib/comments";
import { query } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { CommentItem } from "./CommentItem";

/**
 * Comments after the server-rendered first page. Fetches anonymously (comments
 * are public) and appends each page below the first.
 */
export function MoreComments({
  coffeeId,
  first,
  total,
  locale,
}: {
  coffeeId: string;
  first: CommentData[];
  total: number;
  locale: Locale;
}) {
  const [extra, setExtra] = useState<CommentData[]>([]);
  const [lastPage, setLastPage] = useState(first.length);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Drop rows the server-rendered page now shows itself (after a refresh).
  // The next offset is what's on screen: a deleted row leaves both the screen
  // and the server's ordering, so nothing is skipped.
  const shown = appendComments(first, extra);
  const more = shown.slice(first.length);

  async function loadMore() {
    setBusy(true);
    setFailed(false);
    try {
      const r = await query(COFFEE_COMMENTS, { id: coffeeId, limit: COMMENTS_PAGE, offset: shown.length });
      const page = r.coffee?.comments ?? [];
      setExtra((prev) => appendComments(prev, page));
      setLastPage(page.length);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {more.length > 0 && (
        <ul className="divide-y divide-stone-200 border-t border-stone-200">
          {more.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              locale={locale}
              onDeleted={(id) => setExtra((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </ul>
      )}
      {hasMoreComments(shown.length, total, lastPage) && (
        <div className="border-t border-stone-200 p-3 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={busy}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50 disabled:opacity-60"
          >
            {busy ? t(locale, "comments.loadingMore") : t(locale, "comments.more")}
          </button>
          {failed && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t(locale, "comments.moreError")}
            </p>
          )}
        </div>
      )}
    </>
  );
}
