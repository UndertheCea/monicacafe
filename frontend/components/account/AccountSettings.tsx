"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { FormError, Notice, inputCls } from "@/components/dashboard/ui";
import { CommentFeed } from "@/components/CommentFeed";
import { FollowedShops } from "@/components/account/FollowedShops";
import { SavedCoffees } from "@/components/account/SavedCoffees";
import { COMMENT_LIST_PAGE } from "@/lib/comments";
import { MY_COMMENTS } from "@/lib/dashboard/queries";
import {
  accountDeletionBlock,
  cleanDisplayName,
  deleteAccountErrorKey,
  passwordChangeProblem,
  passwordErrorKey,
} from "@/lib/auth/account";
import { UPDATE_PROFILE } from "@/lib/auth/session";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";

type Msg = { key: MessageKey; vars?: Record<string, number> };

const sectionCls = "space-y-4 rounded-2xl bg-white p-6 ring-1 ring-line";
const buttonCls =
  "rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/80 disabled:opacity-60";
const labelCls = "block text-sm font-medium text-ink";

function Saved({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-sm text-ink">
      {children}
    </p>
  );
}

export function AccountSettings({ locale }: { locale: Locale }) {
  const { status } = useAuth();
  const router = useRouter();
  // Set while "sign out of all devices" runs: that sign-out sends the user
  // home, so the "signed out → log in" redirect below must not race it.
  const leaving = useRef(false);
  useEffect(() => {
    if (status === "anonymous" && !leaving.current) router.replace("/login?next=%2Faccount");
  }, [status, router]);
  if (status !== "authenticated") return <Notice>{t(locale, "dash.loading")}</Notice>;
  const onLeave = (v: boolean) => {
    leaving.current = v;
  };
  return (
    <div className="space-y-6">
      <ProfileForm locale={locale} />
      <PasswordForm locale={locale} />
      <SavedCoffees locale={locale} />
      <FollowedShops locale={locale} />
      <MyComments locale={locale} />
      <Sessions locale={locale} onLeave={onLeave} />
      <DeleteAccount locale={locale} onLeave={onLeave} />
    </div>
  );
}

function MyComments({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    async (offset: number) => {
      const r = await request(MY_COMMENTS, { limit: COMMENT_LIST_PAGE, offset });
      if (!r.me) throw new Error("signed out");
      return r.me.comments;
    },
    [request],
  );
  return (
    <CommentFeed
      locale={locale}
      id="my-comments"
      title="account.myComments"
      empty="account.noComments"
      showAuthor={false}
      fetchPage={fetchPage}
    />
  );
}

function ProfileForm({ locale }: { locale: Locale }) {
  const { user, request, reload } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanDisplayName(name);
    setSaved(false);
    if (!clean) return setError({ key: "auth.error.displayName" });
    setBusy(true);
    setError(null);
    try {
      await request(UPDATE_PROFILE, { input: { displayName: clean } });
      setName(clean);
      await reload(); // the account menu shows the new name
      setSaved(true);
    } catch (err) {
      const e2 = toApiError(err);
      setError(
        e2.code === "BAD_USER_INPUT"
          ? { key: "auth.error.displayName" }
          : e2.code === "UNAVAILABLE"
            ? { key: "auth.error.unavailable" }
            : { key: "account.error.generic" },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={sectionCls}>
      <h2 className="text-lg font-semibold text-ink">{t(locale, "account.profile")}</h2>
      {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
      <p className="text-sm text-muted">
        {t(locale, "account.email")}: <span className="font-medium text-ink">{user?.email}</span>
      </p>
      <label className={labelCls}>
        {t(locale, "auth.displayName")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoComplete="nickname"
          className={inputCls}
        />
        <span className="mt-1 block text-xs font-normal text-muted">{t(locale, "auth.displayNameHint")}</span>
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={buttonCls}>
          {busy ? t(locale, "account.saving") : t(locale, "account.save")}
        </button>
        {saved && <Saved>{t(locale, "account.saved")}</Saved>}
      </div>
    </form>
  );
}

const PROBLEM_KEY = {
  current: "account.error.current",
  password: "auth.error.password",
  same: "account.error.same",
  mismatch: "account.error.mismatch",
} as const satisfies Record<string, MessageKey>;

function PasswordForm({ locale }: { locale: Locale }) {
  const { user, changePassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const current = String(fd.get("currentPassword") ?? "");
    const next = String(fd.get("newPassword") ?? "");
    const confirm = String(fd.get("confirmPassword") ?? "");
    setDone(false);
    const problem = passwordChangeProblem(current, next, confirm);
    if (problem) return setError({ key: PROBLEM_KEY[problem] });
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      form.reset();
      setDone(true);
    } catch (err) {
      const e2 = toApiError(err);
      setError(e2.code === "RATE_LIMITED" ? rateLimitMessage(e2.retryAfter) : { key: passwordErrorKey(e2.code, e2.field) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={sectionCls}>
      <h2 className="text-lg font-semibold text-ink">{t(locale, "account.password")}</h2>
      <p className="text-sm text-muted">{t(locale, "account.passwordHint")}</p>
      {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
      {/* Lets password managers attach the new password to the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={user?.email ?? ""} readOnly />
      <label className={labelCls}>
        {t(locale, "account.currentPassword")}
        <input name="currentPassword" type="password" required autoComplete="current-password" className={inputCls} />
      </label>
      <label className={labelCls}>
        {t(locale, "account.newPassword")}
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
        <span className="mt-1 block text-xs font-normal text-muted">{t(locale, "auth.passwordHint")}</span>
      </label>
      <label className={labelCls}>
        {t(locale, "account.confirmPassword")}
        <input name="confirmPassword" type="password" required autoComplete="new-password" className={inputCls} />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={buttonCls}>
          {busy ? t(locale, "account.saving") : t(locale, "account.changePassword")}
        </button>
        {done && <Saved>{t(locale, "account.passwordChanged")}</Saved>}
      </div>
    </form>
  );
}

function Sessions({ locale, onLeave }: { locale: Locale; onLeave: (leaving: boolean) => void }) {
  const { logoutEverywhere } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    onLeave(true);
    try {
      await logoutEverywhere();
      router.replace("/");
    } catch (err) {
      onLeave(false);
      setError(toApiError(err).code === "UNAVAILABLE" ? "auth.error.unavailable" : "account.error.sessions");
      setBusy(false);
    }
  }

  return (
    <section className={sectionCls} aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="text-lg font-semibold text-ink">
        {t(locale, "account.sessions")}
      </h2>
      <p className="text-sm text-muted">{t(locale, "account.sessionsHint")}</p>
      {error && <FormError>{t(locale, error)}</FormError>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink">{t(locale, "account.logoutAllConfirm")}</span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white hover:bg-danger/80 disabled:opacity-60"
          >
            {busy ? t(locale, "account.loggingOut") : t(locale, "account.logoutAllYes")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-sm font-medium text-muted underline-offset-2 hover:underline"
          >
            {t(locale, "account.cancel")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={buttonCls}>
          {t(locale, "account.logoutAll")}
        </button>
      )}
    </section>
  );
}

function DeleteAccount({ locale, onLeave }: { locale: Locale; onLeave: (leaving: boolean) => void }) {
  const { user, deleteAccount } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  if (!user) return null;
  const block = accountDeletionBlock(user);

  async function onConfirm() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    onLeave(true);
    try {
      await deleteAccount(password);
      router.replace("/");
    } catch (err) {
      onLeave(false);
      const e = toApiError(err);
      setError(e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : { key: deleteAccountErrorKey(e.code, e.field) });
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <section className={`${sectionCls} ring-danger/30`} aria-labelledby="delete-title">
      <h2 id="delete-title" className="text-lg font-semibold text-danger">
        {t(locale, "account.delete.title")}
      </h2>
      <p className="text-sm text-muted">{t(locale, "account.delete.hint")}</p>
      {block ? (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink">
          {t(locale, block === "shop" ? "account.delete.blockedShop" : "account.delete.blockedAdmin")}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) setConfirming(true);
          }}
        >
          <div>
            <label htmlFor="delete-password" className={labelCls}>
              {t(locale, "account.delete.password")}
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setConfirming(false);
              }}
              className={inputCls}
            />
          </div>
          {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-ink">{t(locale, "account.delete.confirm")}</span>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white hover:bg-danger/80 disabled:opacity-60"
              >
                {busy ? t(locale, "account.delete.deleting") : t(locale, "account.delete.yes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="text-sm font-medium text-muted underline-offset-2 hover:underline"
              >
                {t(locale, "account.cancel")}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!password}
              className="rounded-full px-5 py-2 text-sm font-semibold text-danger ring-1 ring-danger/30 hover:bg-danger/10 disabled:opacity-60"
            >
              {t(locale, "account.delete.button")}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
