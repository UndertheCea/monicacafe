"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADD_COMMENT, COMMENT_MAX, DELETE_COMMENT as DELETE_COMMENT_DOC } from "@/lib/api";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { useAuth } from "@/components/auth/AuthProvider";

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
      <p className="mt-4 text-sm text-stone-600">
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="font-semibold text-amber-700 hover:underline"
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
    <form onSubmit={onSubmit} className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <label htmlFor="comment-body" className="text-sm font-semibold text-stone-700">
        {t(locale, "comments.label")}
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={t(locale, "comments.placeholder")}
        aria-invalid={tooLong}
        aria-describedby="comment-count"
        className="mt-2 w-full resize-y rounded-xl border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span id="comment-count" className={tooLong ? "text-xs text-red-600" : "text-xs text-stone-500"}>
          {tooLong
            ? t(locale, "comments.tooLong", { max: COMMENT_MAX })
            : t(locale, "comments.remaining", { n: COMMENT_MAX - len })}
        </span>
        <button
          type="submit"
          disabled={busy || len === 0 || tooLong}
          className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? t(locale, "comments.sending") : t(locale, "comments.submit")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
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
      {failed && <span className="text-xs text-red-600">{t(locale, "comments.deleteError")}</span>}
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
        className="text-xs font-medium text-stone-500 hover:text-red-700 disabled:opacity-50"
      >
        {t(locale, "comments.delete")}
      </button>
    </span>
  );
}
