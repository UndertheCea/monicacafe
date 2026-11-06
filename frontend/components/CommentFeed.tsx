"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DeleteCommentButton } from "@/components/coffees/CommentForm";
import { COMMENT_LIST_PAGE, appendComments, commentCoffeeHref, hasMoreComments, withoutComment } from "@/lib/comments";
import type { CommentPage } from "@/lib/dashboard/queries";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";

type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; page: CommentPage; lastPage: number; more: "idle" | "loading" | "error" };

/**
 * A newest-first list of comments across coffees (dashboard "Recent comments",
 * /account "My comments"): each row names its coffee and links to it. Rows the
 * viewer wrote get a delete button. Seller text is rendered as text only.
 */
export function CommentFeed({
  locale,
  id,
  title,
  empty,
  showAuthor,
  fetchPage,
}: {
  locale: Locale;
  /** id of the section heading (aria-labelledby). */
  id: string;
  title: MessageKey;
  empty: MessageKey;
  /** The dashboard shows who wrote each comment; /account doesn't (it's always you). */
  showAuthor: boolean;
  /** Fetch `COMMENT_LIST_PAGE` comments from `offset`; stable across renders. */
  fetchPage: (offset: number) => Promise<CommentPage>;
}) {
  const [s, setS] = useState<State>({ state: "loading" });

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (page) => live && setS({ state: "ready", page, lastPage: page.nodes.length, more: "idle" }),
      () => live && setS({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (s.state !== "ready") return;
    const shown = s.page;
    setS({ ...s, more: "loading" });
    try {
      const next = await fetchPage(shown.nodes.length);
      setS({
        state: "ready",
        page: { total: next.total, nodes: appendComments(shown.nodes, next.nodes) },
        lastPage: next.nodes.length,
        more: "idle",
      });
    } catch {
      setS({ ...s, more: "error" });
    }
  }, [s, fetchPage]);

  const removed = (cid: string) =>
    setS((cur) => (cur.state === "ready" ? { ...cur, page: withoutComment(cur.page, cid) } : cur));

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold text-stone-900">
        {t(locale, title)}
        {s.state === "ready" && s.page.total > 0 && (
          <span className="ml-2 text-sm font-normal text-stone-500">
            {t(locale, "comments.count", { n: s.page.total })}
          </span>
        )}
      </h2>

      {s.state === "loading" && <p className="mt-4 text-sm text-stone-500">{t(locale, "dash.loading")}</p>}
      {s.state === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {t(locale, "dash.error.generic")}
        </p>
      )}
      {s.state === "ready" && s.page.nodes.length === 0 && (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, empty)}
        </p>
      )}
      {s.state === "ready" && s.page.nodes.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
          {s.page.nodes.map((c) => {
            const href = commentCoffeeHref(c.coffee);
            return (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0 text-stone-500">
                    {showAuthor && <span className="font-semibold text-stone-800">{c.user.displayName} · </span>}
                    {href && c.coffee ? (
                      <Link href={href} className="font-medium text-amber-700 hover:underline">
                        {c.coffee.name}
                      </Link>
                    ) : (
                      <span>{t(locale, "comments.coffeeHidden")}</span>
                    )}
                    {c.coffee && !c.coffee.isPublished && (
                      <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                        {t(locale, "dash.draft")}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <DeleteCommentButton commentId={c.id} authorId={c.user.id} locale={locale} onDeleted={removed} />
                    <time dateTime={c.createdAt} className="text-xs text-stone-400">
                      {formatTaipeiDate(c.createdAt, locale)}
                    </time>
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-stone-700">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}
      {s.state === "ready" &&
        hasMoreComments(s.page.nodes.length, s.page.total, s.lastPage, COMMENT_LIST_PAGE) && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {s.more === "error" && (
              <p role="alert" className="text-sm text-red-700">
                {t(locale, "comments.moreError")}
              </p>
            )}
            <button
              type="button"
              disabled={s.more === "loading"}
              onClick={() => void loadMore()}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:border-stone-500 disabled:opacity-50"
            >
              {t(locale, s.more === "loading" ? "comments.loadingMore" : "comments.more")}
            </button>
          </div>
        )}
    </section>
  );
}
