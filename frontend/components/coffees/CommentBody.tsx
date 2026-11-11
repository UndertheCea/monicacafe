"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UPDATE_COMMENT } from "@/lib/api";
import { COMMENT_MAX_CHARS, canEditComment, commentEditErrorKey, commentEditState } from "@/lib/comments";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

type Edited = { id: string; body: string; editedAt: string | null };

/**
 * A comment's text with its "edited" marker, plus an inline editor for the
 * author while the coffee is published. The text is rendered as text only.
 */
export function CommentBody({
  comment,
  coffeePublished,
  locale,
  onEdited,
}: {
  comment: { id: string; body: string; editedAt: string | null; user: { id: string } };
  coffeePublished: boolean;
  locale: Locale;
  /** For client-held lists, which a refresh doesn't update. */
  onEdited?: (c: Edited) => void;
}) {
  const { user, request } = useAuth();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fieldId = useId();
  // The last saved edit, shown until the props catch up (refresh / parent state).
  const [saved, setSaved] = useState<Edited | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  const current = saved && saved.id === comment.id ? saved : comment;
  const editable = canEditComment(user?.id, comment.user.id, coffeePublished);

  const editedMark = current.editedAt && (
    <span
      className="ml-2 text-xs text-muted"
      title={t(locale, "comments.editedAt", { date: formatTaipeiDate(current.editedAt, locale) })}
    >
      ({t(locale, "comments.edited")})
    </span>
  );

  if (draft === null) {
    return (
      <div className="mt-1">
        <p className="whitespace-pre-line break-words text-ink">
          {current.body}
          {editedMark}
        </p>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setDraft(current.body);
              setError(null);
            }}
            className="-ml-2 mt-1 inline-flex min-h-11 items-center px-2 text-xs font-medium text-muted hover:text-ink hover:underline underline-offset-4"
          >
            {t(locale, "comments.edit")}
          </button>
        )}
      </div>
    );
  }

  const st = commentEditState(draft, current.body);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!st.canSave || busy || draft === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await request(UPDATE_COMMENT, { id: comment.id, body: draft.trim() });
      setSaved(r.updateComment);
      setDraft(null);
      onEdited?.(r.updateComment);
      startTransition(() => router.refresh());
    } catch (err) {
      const e2 = toApiError(err);
      setError(e2.code === "RATE_LIMITED" ? rateLimitMessage(e2.retryAfter) : { key: commentEditErrorKey(e2.code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="mt-2">
      <label htmlFor={fieldId} className="sr-only">
        {t(locale, "comments.editLabel")}
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        autoFocus
        aria-invalid={st.tooLong}
        aria-describedby={`${fieldId}-count`}
        className="w-full resize-y rounded-xl border border-line px-3 py-2 text-ink outline-none focus:border-ink focus:ring-2 focus:ring-line"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span id={`${fieldId}-count`} className={st.tooLong ? "text-xs text-danger" : "text-xs text-muted"}>
          {st.tooLong
            ? t(locale, "comments.tooLong", { max: COMMENT_MAX_CHARS })
            : t(locale, "comments.remaining", { n: COMMENT_MAX_CHARS - st.len })}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-muted ring-1 ring-line hover:bg-paper"
          >
            {t(locale, "comments.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !st.canSave}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/80 disabled:opacity-50"
          >
            {busy ? t(locale, "comments.saving") : t(locale, "comments.save")}
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {t(locale, error.key, { max: COMMENT_MAX_CHARS, ...error.vars })}
        </p>
      )}
    </form>
  );
}
