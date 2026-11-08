import type { CommentData } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";
import { MoreComments } from "./MoreComments";

/** Comment list (first page server-rendered, then "load more") plus the signed-in add / delete controls. */
export function CommentList({
  coffeeId,
  isPublished,
  comments,
  total,
  locale,
}: {
  coffeeId: string;
  isPublished: boolean;
  comments: CommentData[];
  total: number;
  locale: Locale;
}) {
  return (
    <section aria-labelledby="comments-heading" className="mt-12">
      <h2 id="comments-heading" className="text-xl font-bold text-ink">
        {t(locale, "comments.title", { n: total })}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-neutral-500 ring-1 ring-neutral-200">
          {t(locale, "comments.empty")}
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-white ring-1 ring-neutral-200">
          <ul className="divide-y divide-neutral-200">
            {comments.map((c) => (
              <CommentItem key={c.id} comment={c} coffeePublished={isPublished} locale={locale} />
            ))}
          </ul>
          <MoreComments coffeeId={coffeeId} coffeePublished={isPublished} first={comments} total={total} locale={locale} />
        </div>
      )}
      {isPublished ? (
        <CommentForm coffeeId={coffeeId} locale={locale} />
      ) : (
        <p className="mt-3 text-sm text-neutral-500">{t(locale, "comments.draftClosed")}</p>
      )}
    </section>
  );
}
