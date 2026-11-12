"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UPDATE_COMMENT } from "@/lib/api";
import { COMMENT_MAX_CHARS, canEditComment, commentEditErrorKey, commentEditState } from "@/lib/comments";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { formatTaipeiDate } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Field, Textarea, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";

const ORDER = ["body"] as const;

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
  const fe = useFormErrors<"body">(`comment-edit-${fieldId}`, ORDER);

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
              fe.clear();
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
    fe.clear();
    try {
      const r = await request(UPDATE_COMMENT, { id: comment.id, body: draft.trim() });
      setSaved(r.updateComment);
      setDraft(null);
      onEdited?.(r.updateComment);
      startTransition(() => router.refresh());
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "RATE_LIMITED") fe.fail({ fields: {}, form: rateLimitMessage(e2.retryAfter) });
      else if (e2.code === "BAD_USER_INPUT") fe.failField("body", { key: "comments.tooLong", vars: { max: COMMENT_MAX_CHARS } });
      else fe.fail({ fields: {}, form: { key: commentEditErrorKey(e2.code), vars: { max: COMMENT_MAX_CHARS } } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} noValidate className="mt-2 space-y-1">
      <FormSummary formId={`comment-edit-${fieldId}`} locale={locale} errors={fe.errors} order={ORDER} />
      <Field
        id={fe.id("body")}
        label={<span className="sr-only">{t(locale, "comments.editLabel")}</span>}
        error={fieldMessage(locale, fe.errors, "body")}
      >
        {(p) => (
          <Textarea
            {...p}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              fe.clearField("body");
            }}
            rows={3}
            autoFocus
            aria-invalid={st.tooLong || p["aria-invalid"]}
            aria-describedby={`${fieldId}-count${p["aria-describedby"] ? ` ${p["aria-describedby"]}` : ""}`}
          />
        )}
      </Field>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span id={`${fieldId}-count`} className={st.tooLong ? "text-xs text-danger" : "text-xs text-muted"}>
          {st.tooLong
            ? t(locale, "comments.tooLong", { max: COMMENT_MAX_CHARS })
            : t(locale, "comments.remaining", { n: COMMENT_MAX_CHARS - st.len })}
        </span>
        <span className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
                setDraft(null);
                fe.clear();
              }}
            variant="secondary"
          >
            {t(locale, "comments.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={busy || !st.canSave}
          >
            {busy ? t(locale, "comments.saving") : t(locale, "comments.save")}
          </Button>
        </span>
      </div>
    </form>
  );
}
