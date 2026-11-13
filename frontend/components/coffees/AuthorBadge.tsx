import { commentAuthorBadge } from "@/lib/comments";
import { t, type Locale } from "@/lib/i18n/dict";
import { Badge } from "@/components/ui";

/** "店家 / Roaster" next to the author's name on the shop owner's own comments. */
export function AuthorBadge({ comment, locale }: { comment: { fromShop?: boolean | null }; locale: Locale }) {
  const key = commentAuthorBadge(comment);
  if (!key) return null;
  return (
    <Badge tone="outline" title={t(locale, "comments.fromShopTitle")} className="ml-2">
      {t(locale, key)}
    </Badge>
  );
}
