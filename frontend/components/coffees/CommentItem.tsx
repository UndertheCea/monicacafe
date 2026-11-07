import type { CommentData } from "@/lib/api";
import type { Locale } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";
import { AuthorBadge } from "./AuthorBadge";
import { CommentBody } from "./CommentBody";
import { DeleteCommentButton } from "./CommentForm";

/** One comment row; used by the server-rendered first page and by "load more". */
export function CommentItem({
  comment: c,
  coffeePublished,
  locale,
  onDeleted,
}: {
  comment: CommentData;
  /** Edits are allowed only while the coffee is published. */
  coffeePublished: boolean;
  locale: Locale;
  onDeleted?: (id: string) => void;
}) {
  return (
    <li className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span>
          <span className="font-semibold text-stone-800">{c.user.displayName}</span>
          <AuthorBadge comment={c} locale={locale} />
        </span>
        <span className="flex items-baseline gap-3">
          <DeleteCommentButton commentId={c.id} authorId={c.user.id} locale={locale} onDeleted={onDeleted} />
          <time dateTime={c.createdAt} className="text-xs text-stone-400">
            {formatTaipeiDate(c.createdAt, locale)}
          </time>
        </span>
      </div>
      <CommentBody comment={c} coffeePublished={coffeePublished} locale={locale} />
    </li>
  );
}
