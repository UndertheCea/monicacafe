"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADD_COMMENT, COMMENT_MAX, DELETE_COMMENT as DELETE_COMMENT_DOC } from "@/lib/api";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Textarea } from "@/components/ui";
import { CARD } from "@/lib/ui";

/** Rune count, matching the backend's utf8.RuneCountInString. */
const runeLength = (s: string) => [...s].length;

export function CommentForm({ coffeeId, locale }: { coffeeId: string; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);
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
    setError(null);
    try {
      await request(ADD_COMMENT, { input: { coffeeId, body: body.trim() } });
      setBody("");
      startTransition(() => router.refresh());
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "RATE_LIMITED") setError(rateLimitMessage(e2.retryAfter));
      else setError({ key: e2.code === "BAD_USER_INPUT" ? "comments.tooLong" : "comments.error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD} mt-4 p-4`}>
      <label htmlFor="comment-body" className="text-sm font-semibold text-ink">
        {t(locale, "comments.label")}
      </label>
      <Textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={t(locale, "comments.placeholder")}
        aria-invalid={tooLong}
        aria-describedby="comment-count"
        className="mt-2"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span id="comment-count" className={tooLong ? "text-xs text-danger" : "text-xs text-muted"}>
          {tooLong
            ? t(locale, "comments.tooLong", { max: COMMENT_MAX })
            : t(locale, "comments.remaining", { n: COMMENT_MAX - len })}
        </span>
        <Button
          type="submit"
          disabled={busy || len === 0 || tooLong}
        >
          {busy ? t(locale, "comments.sending") : t(locale, "comments.submit")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(locale, error.key, { max: COMMENT_MAX, ...error.vars })}
        </p>
      )}
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

  return (
    <span className="inline-flex items-center gap-2">
      {failed && <span className="text-xs text-danger">{t(locale, "comments.deleteError")}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(t(locale, "comments.deleteConfirm"))) return;
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
        }}
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-muted hover:text-danger disabled:opacity-50"
      >
        {t(locale, "comments.delete")}
      </button>
    </span>
  );
}
