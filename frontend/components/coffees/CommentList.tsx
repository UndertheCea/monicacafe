import type { CommentData } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";
import { MoreComments } from "./MoreComments";
import { Card, SectionTitle } from "@/components/ui";

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
      <SectionTitle id="comments-heading">
        {t(locale, "comments.title", { n: total })}
      </SectionTitle>
      {comments.length === 0 ? (
        <Card as="p" className="mt-4 p-6 text-center text-muted">
          {t(locale, "comments.empty")}
        </Card>
      ) : (
        <Card className="mt-4">
          <ul className="divide-y divide-line">
            {comments.map((c) => (
              <CommentItem key={c.id} comment={c} coffeePublished={isPublished} locale={locale} />
            ))}
          </ul>
          <MoreComments coffeeId={coffeeId} coffeePublished={isPublished} first={comments} total={total} locale={locale} />
        </Card>
      )}
      {isPublished ? (
        <CommentForm coffeeId={coffeeId} locale={locale} />
      ) : (
        <p className="mt-3 text-sm text-muted">{t(locale, "comments.draftClosed")}</p>
      )}
    </section>
  );
}
