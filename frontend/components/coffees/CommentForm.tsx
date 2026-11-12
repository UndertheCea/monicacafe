"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADD_COMMENT, COMMENT_MAX, DELETE_COMMENT as DELETE_COMMENT_DOC } from "@/lib/api";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale } from "@/lib/i18n/dict";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, ConfirmButton, Field, Textarea, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import { placeError } from "@/lib/formErrors";
import { CARD } from "@/lib/ui";

const ORDER = ["body"] as const;

/** Rune count, matching the backend's utf8.RuneCountInString. */
const runeLength = (s: string) => [...s].length;

export function CommentForm({ coffeeId, locale }: { coffeeId: string; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [body, setBody] = useState("");
  const fe = useFormErrors<"body">("comment", ORDER);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  if (status === "loading") return null;
  if (status === "anonymous") {
    return (
      <p className="mt-4 text-sm text-muted">
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="font-semibold text-ink underline-offset-4 hover:underline"
        >
          {t(locale, "comments.loginLink")}
        </Link>{" "}
        · {t(locale, "comments.loginHint")}
      </p>
    );
  }

  const len = runeLength(body.trim());
  const tooLong = len > COMMENT_MAX;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (len === 0 || tooLong || busy) return;
    setBusy(true);
    fe.clear();
    try {
      await request(ADD_COMMENT, { input: { coffeeId, body: body.trim() } });
      setBody("");
      startTransition(() => router.refresh());
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "RATE_LIMITED") fe.fail({ fields: {}, form: rateLimitMessage(e2.retryAfter) });
      else if (e2.code === "BAD_USER_INPUT") fe.failField("body", { key: "comments.tooLong", vars: { max: COMMENT_MAX } });
      else fe.fail(placeError(undefined, { key: "comments.error" }, ORDER));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`${CARD} mt-4 space-y-2 p-4`}>
      <FormSummary formId="comment" locale={locale} errors={fe.errors} order={ORDER} />
      <Field
        id={fe.id("body")}
        label={t(locale, "comments.label")}
        error={fieldMessage(locale, fe.errors, "body")}
      >
        {(p) => (
          <Textarea
            {...p}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              fe.clearField("body");
            }}
            rows={3}
            placeholder={t(locale, "comments.placeholder")}
            aria-invalid={tooLong || p["aria-invalid"]}
            aria-describedby={`comment-count${p["aria-describedby"] ? ` ${p["aria-describedby"]}` : ""}`}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id="comment-count" className={tooLong ? "text-xs text-danger" : "text-xs text-muted"}>
          {tooLong
            ? t(locale, "comments.tooLong", { max: COMMENT_MAX })
            : t(locale, "comments.remaining", { n: COMMENT_MAX - len })}
        </span>
        <Button type="submit" disabled={busy || len === 0 || tooLong}>
          {busy ? t(locale, "comments.sending") : t(locale, "comments.submit")}
        </Button>
      </div>
    </form>
  );
}

/** Delete button shown only to the comment's author (or an admin). */
export function DeleteCommentButton({
  commentId,
  authorId,
  locale,
  onDeleted,
}: {
  commentId: string;
  authorId: string;
  locale: Locale;
  /** For rows outside the server-rendered page ("load more"), which a refresh doesn't remove. */
  onDeleted?: (id: string) => void;
}) {
  const { user, request } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  if (!user || (user.id !== authorId && user.role !== "ADMIN")) return null;

  async function remove() {
    setBusy(true);
    setFailed(false);
    try {
      await request(DELETE_COMMENT_DOC, { id: commentId });
      onDeleted?.(commentId);
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {failed && <span className="text-xs text-danger">{t(locale, "comments.deleteError")}</span>}
      <ConfirmButton
        question={t(locale, "comments.deleteConfirm")}
        confirmLabel={t(locale, "comments.delete")}
        cancelLabel={t(locale, "confirm.cancel")}
        busy={busy}
        onConfirm={() => void remove()}
      >
        {t(locale, "comments.delete")}
      </ConfirmButton>
    </span>
  );
}
