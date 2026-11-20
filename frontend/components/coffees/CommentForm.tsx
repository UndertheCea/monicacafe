"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ADD_COMMENT, COMMENT_MAX, DELETE_COMMENT as DELETE_COMMENT_DOC } from "@/lib/api";
import { commentInputErrorKey, deleteControl, deleteOutcome } from "@/lib/comments";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { showSignInLink } from "@/lib/navMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { focusAfterRemoval } from "@/components/focusAfterRemoval";
import { ReasonPrompt } from "@/components/admin/ReasonPrompt";
import { Button, ConfirmButton, Field, Textarea, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import { placeError } from "@/lib/formErrors";
import { isContactInfoError } from "@/lib/moderation";
import { CARD } from "@/lib/ui";
import { pluralKey } from "@/lib/plural";

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
  // "Posted" in a polite live region, cleared when the visitor types again (#406).
  const [posted, setPosted] = useState(false);
  const [, startTransition] = useTransition();

  // Loading shows the link too: without JavaScript the status never resolves (#424).
  if (showSignInLink(status)) {
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
    setPosted(false);
    fe.clear();
    try {
      await request(ADD_COMMENT, { input: { coffeeId, body: body.trim() } });
      setBody("");
      setPosted(true);
      // Submit is disabled with an empty body, which drops focus: back to the textarea (#406).
      document.getElementById(fe.id("body"))?.focus();
      startTransition(() => router.refresh());
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "RATE_LIMITED") fe.fail({ fields: {}, form: rateLimitMessage(e2.retryAfter) });
      else if (isContactInfoError(e2.code)) fe.fail(placeError(e2.field, { key: "contact.error" }, ORDER));
      else if (e2.code === "BAD_USER_INPUT") fe.failField("body", { key: commentInputErrorKey(body, COMMENT_MAX), vars: { max: COMMENT_MAX } });
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
        hint={t(locale, "contact.hint")}
        error={fieldMessage(locale, fe.errors, "body")}
      >
        {(p) => (
          <Textarea
            {...p}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setPosted(false);
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
            : t(locale, pluralKey("comments.remaining", COMMENT_MAX - len), { n: COMMENT_MAX - len })}
        </span>
        <Button type="submit" disabled={busy || len === 0 || tooLong}>
          {busy ? t(locale, "comments.sending") : t(locale, "comments.submit")}
        </Button>
      </div>
      <p role="status" className="text-sm text-ink">
        {posted ? t(locale, "comments.posted") : ""}
      </p>
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
  const [failed, setFailed] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);
  const [, startTransition] = useTransition();
  const self = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [prompting, setPrompting] = useState(false);

  const control = deleteControl(user, authorId);
  if (control === "none") return null;
  // An admin removing someone else's comment: a takedown, so it needs a reason
  // for the audit log (#421).
  const takedown = control === "takedown";

  function removed() {
    focusAfterRemoval(self.current?.closest("[data-row]")); // keep the visitor's place (#405)
    onDeleted?.(commentId);
    startTransition(() => router.refresh());
  }

  /** The takedown path: errors go back to ReasonPrompt, which shows them. */
  async function takeDown(reason: string) {
    try {
      await request(DELETE_COMMENT_DOC, { id: commentId, reason });
    } catch (err) {
      if (deleteOutcome(toApiError(err).code) !== "gone") throw err;
    }
    removed();
  }

  async function remove() {
    setBusy(true);
    setFailed(null);
    try {
      await request(DELETE_COMMENT_DOC, { id: commentId });
      removed();
    } catch (err) {
      const e = toApiError(err);
      const outcome = deleteOutcome(e.code);
      if (outcome === "gone") {
        // Already deleted elsewhere: same end state as a successful delete.
        focusAfterRemoval(self.current?.closest("[data-row]"));
        onDeleted?.(commentId);
        startTransition(() => router.refresh());
        return;
      }
      setFailed(outcome === "rateLimited" ? rateLimitMessage(e.retryAfter) : { key: "comments.deleteError" });
      setBusy(false);
    }
  }

  if (takedown) {
    return (
      <span ref={self} className="inline-flex items-center gap-2">
        {prompting ? (
          <ReasonPrompt
            locale={locale}
            required
            onConfirm={takeDown}
            onCancel={() => {
              setPrompting(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          />
        ) : (
          <Button ref={trigger} variant="quiet" size="sm" onClick={() => setPrompting(true)}>
            {t(locale, "comments.delete")}
          </Button>
        )}
      </span>
    );
  }

  return (
    <span ref={self} className="inline-flex items-center gap-2">
      {failed && <span role="alert" className="text-xs text-danger">{t(locale, failed.key, failed.vars)}</span>}
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
