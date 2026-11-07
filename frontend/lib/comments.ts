// Comment paging helpers (pure, no imports, so `npm test` can load them).

/** Comments per page: the first page is server-rendered, "load more" fetches the next. */
export const COMMENTS_PAGE = 20;

/**
 * Appends a fetched page to the comments already shown, skipping ids that are
 * already there. Pages are offset-based, so a comment posted between two
 * fetches shifts the next page by one and would otherwise appear twice.
 */
export function appendComments<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((c) => c.id));
  return [...shown, ...page.filter((c) => !seen.has(c.id))];
}

/**
 * Whether a "load more" button makes sense: fewer shown than the total, and
 * the last page wasn't short (a short page means the end, even if the count
 * was stale).
 */
export function hasMoreComments(shown: number, total: number, lastPageSize: number, pageSize = COMMENTS_PAGE): boolean {
  return shown < total && lastPageSize >= pageSize;
}

/** Comments per page in the dashboard's "Recent comments" and /account's "My comments". */
export const COMMENT_LIST_PAGE = 10;

/**
 * Where a comment in a cross-coffee list links: the public page for a
 * published coffee, the dashboard preview for a draft (only its owner gets
 * one back from the API), nowhere when the API hid the coffee (null).
 */
export function commentCoffeeHref(coffee: { id: string; isPublished: boolean } | null | undefined): string | null {
  if (!coffee) return null;
  const id = encodeURIComponent(coffee.id);
  return coffee.isPublished ? `/coffees/${id}` : `/dashboard/coffees/${id}/preview`;
}

/** A comment list after deleting one row: the row goes and the total drops (only if it was there). */
export function withoutComment<T extends { id: string }>(page: { total: number; nodes: T[] }, id: string) {
  const nodes = page.nodes.filter((c) => c.id !== id);
  const removed = page.nodes.length - nodes.length;
  return { total: Math.max(0, page.total - removed), nodes };
}

/** Max comment length in characters (runes), as the API counts it. */
export const COMMENT_MAX_CHARS = 500;

/** Rune count of the trimmed text, matching the backend's validation. */
export function commentLength(body: string): number {
  return [...body.trim()].length;
}

/**
 * Whether the viewer may edit a comment: only its author (admins may delete,
 * not rewrite), and only while the coffee is published (the API refuses
 * otherwise).
 */
export function canEditComment(viewerId: string | null | undefined, authorId: string, coffeePublished: boolean): boolean {
  return !!viewerId && viewerId === authorId && coffeePublished;
}

/** State of an edit box: length, too long, unchanged from the saved text, and whether Save is allowed. */
export function commentEditState(draft: string, saved: string, max = COMMENT_MAX_CHARS) {
  const len = commentLength(draft);
  const tooLong = len > max;
  const unchanged = draft.trim() === saved.trim();
  return { len, tooLong, unchanged, canSave: len > 0 && !tooLong && !unchanged };
}

/** Message key for a failed updateComment (RATE_LIMITED is handled by the caller with its wait time). */
export function commentEditErrorKey(code: string): "comments.tooLong" | "comments.editGone" | "comments.editError" {
  if (code === "BAD_USER_INPUT") return "comments.tooLong";
  if (code === "NOT_FOUND") return "comments.editGone";
  return "comments.editError";
}

/** A comment list with one row's text replaced by the saved edit (other rows and the total unchanged). */
export function withEditedComment<T extends { id: string; body: string; editedAt: string | null }>(
  page: { total: number; nodes: T[] },
  edited: { id: string; body: string; editedAt: string | null },
) {
  return {
    total: page.total,
    nodes: page.nodes.map((c) => (c.id === edited.id ? { ...c, body: edited.body, editedAt: edited.editedAt } : c)),
  };
}
