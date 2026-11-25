"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthorBadge } from "@/components/coffees/AuthorBadge";
import { CommentBody } from "@/components/coffees/CommentBody";
import { DeleteCommentButton } from "@/components/coffees/CommentForm";
import { useLoadMore } from "@/components/useLoadMore";
import { focusLoadedRow } from "@/components/focusAfterRemoval";
import { emptiedWithMore, firstNewRow } from "@/lib/loadMore";
import { COMMENT_LIST_PAGE, commentCoffeeHref, hasMoreComments, withEditedComment, withoutComment } from "@/lib/comments";
import type { CommentPage } from "@/lib/dashboard/queries";
import { nextLoadKey } from "@/lib/retry";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; page: CommentPage; lastPage: number; more: "idle" | "loading" | "error" };

/**
 * A newest-first list of comments across coffees (dashboard "Recent comments",
 * /account "My comments"): each row names its coffee and links to it. Rows the
 * viewer wrote get edit (published coffees only) and delete buttons. Seller text is rendered as text only.
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
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" (#437)

  const more = useLoadMore(fetchPage);

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (page) => live && setS({ state: "ready", page, lastPage: page.nodes.length, more: "idle" }),
      () => live && setS({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage, attempt]);

  /** `shownNow`: the rows left after a removal, when it is called before that render. */
  async function loadMore(shownNow?: number) {
    if (s.state !== "ready") return;
    const shown = shownNow ?? s.page.nodes.length;
    setS((cur) => (cur.state === "ready" ? { ...cur, more: "loading" } : cur));
    try {
      const next = await more.fetchMore(shown);
      // Merge into the list as it is now: rows removed meanwhile stay gone (#338).
      setS((cur) =>
        cur.state === "ready"
          ? { ...cur, page: more.merge(cur.page, next), lastPage: next.nodes.length, more: "idle" }
          : cur,
      );
      // The last page removes the button: focus goes to the first row it added (#510).
      focusLoadedRow(firstNewRow(s.page.nodes, next.nodes));
    } catch {
      setS((cur) => (cur.state === "ready" ? { ...cur, more: "error" } : cur));
    }
  }

  const edited = (e: { id: string; body: string; editedAt: string | null }) =>
    setS((cur) => (cur.state === "ready" ? { ...cur, page: withEditedComment(cur.page, e) } : cur));
  const removed = (cid: string) => {
    more.removed(cid);
    setS((cur) => (cur.state === "ready" ? { ...cur, page: withoutComment(cur.page, cid) } : cur));
    if (s.state === "ready" && s.more === "idle") {
      const left = withoutComment(s.page, cid);
      if (emptiedWithMore(left.nodes.length, left.total, s.lastPage, COMMENT_LIST_PAGE)) void loadMore(0);
    }
  };

  // Removals emptied the rows on screen but more are left: the removal fetches
  // them (below "load more" shows its progress or error), so no empty state (#404).
  const refilling =
    s.state === "ready" && emptiedWithMore(s.page.nodes.length, s.page.total, s.lastPage, COMMENT_LIST_PAGE);

  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id}>
        {t(locale, title)}
        {s.state === "ready" && s.page.total > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">
            {t(locale, "comments.count", { n: s.page.total })}
          </span>
        )}
      </SectionTitle>

      {s.state === "loading" && <p className="mt-4 text-sm text-muted">{t(locale, "dash.loading")}</p>}
      {s.state === "error" && (
        <div className="mt-4 space-y-3">
          <p role="alert" className="text-sm text-danger">
            {t(locale, "dash.error.generic")}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setS({ state: "loading" });
              setAttempt(nextLoadKey);
            }}
          >
            {t(locale, "crash.retry")}
          </Button>
        </div>
      )}
      {s.state === "ready" && s.page.nodes.length === 0 && !refilling && (
        <Card as="p" className="mt-4 p-6 text-center text-muted">
          {t(locale, empty)}
        </Card>
      )}
      {s.state === "ready" && s.page.nodes.length > 0 && (
        <Card as="ul" className="mt-4 divide-y divide-line">
          {s.page.nodes.map((c) => {
            const href = commentCoffeeHref(c.coffee);
            return (
              <li key={c.id} data-row={c.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0 text-muted">
                    {showAuthor && (
                      <>
                        <span className="font-semibold text-ink">{c.user.displayName}</span>
                        <AuthorBadge comment={c} locale={locale} />
                        {" · "}
                      </>
                    )}
                    {href && c.coffee ? (
                      <Link href={href} className="font-medium text-ink underline-offset-4 hover:underline">
                        {c.coffee.name}
                      </Link>
                    ) : (
                      <span>{t(locale, "comments.coffeeHidden")}</span>
                    )}
                    {c.coffee && !c.coffee.isPublished && (
                      <Badge tone="soft" className="ml-2">
                        {t(locale, "dash.draft")}
                      </Badge>
                    )}
                  </span>
                  <span data-row-action className="flex items-baseline gap-3">
                    <DeleteCommentButton commentId={c.id} authorId={c.user.id} locale={locale} onDeleted={removed} />
                    <time dateTime={c.createdAt} className="text-xs text-muted">
                      {formatTaipeiDate(c.createdAt)}
                    </time>
                  </span>
                </div>
                <CommentBody
                  comment={c}
                  coffeePublished={!!c.coffee?.isPublished}
                  locale={locale}
                  onEdited={edited}
                />
              </li>
            );
          })}
        </Card>
      )}
      {s.state === "ready" &&
        hasMoreComments(s.page.nodes.length, s.page.total, s.lastPage, COMMENT_LIST_PAGE) && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {s.more === "error" && (
              <p role="alert" className="text-sm text-danger">
                {t(locale, "comments.moreError")}
              </p>
            )}
            <Button
              type="button"
              pending={s.more === "loading"}
              onClick={() => void loadMore()}
              variant="secondary"
            >
              {t(locale, s.more === "loading" ? "comments.loadingMore" : "comments.more")}
            </Button>
          </div>
        )}
    </section>
  );
}
