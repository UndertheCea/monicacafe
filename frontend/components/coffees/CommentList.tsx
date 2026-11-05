import type { CommentData } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";
import { CommentForm, DeleteCommentButton } from "./CommentForm";

/** Comment list (server-rendered) plus the signed-in add / delete controls. */
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
      <h2 id="comments-heading" className="text-xl font-bold text-stone-900">
        {t(locale, "comments.title", { n: total })}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "comments.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200">
          {comments.map((c) => (
            <li key={c.id} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-stone-800">{c.user.displayName}</span>
                <span className="flex items-baseline gap-3">
                  <DeleteCommentButton commentId={c.id} authorId={c.user.id} locale={locale} />
                  <time dateTime={c.createdAt} className="text-xs text-stone-400">
                    {formatTaipeiDate(c.createdAt, locale)}
                  </time>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-stone-700">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {isPublished ? (
        <CommentForm coffeeId={coffeeId} locale={locale} />
      ) : (
        <p className="mt-3 text-sm text-stone-500">{t(locale, "comments.draftClosed")}</p>
      )}
    </section>
  );
}
