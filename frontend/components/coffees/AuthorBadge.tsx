import { commentAuthorBadge } from "@/lib/comments";
import { t, type Locale } from "@/lib/i18n/dict";

/** "店家 / Roaster" next to the author's name on the shop owner's own comments. */
export function AuthorBadge({ comment, locale }: { comment: { fromShop?: boolean | null }; locale: Locale }) {
  const key = commentAuthorBadge(comment);
  if (!key) return null;
  return (
    <span
      title={t(locale, "comments.fromShopTitle")}
      className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink ring-1 ring-ink"
    >
      {t(locale, key)}
    </span>
  );
}
