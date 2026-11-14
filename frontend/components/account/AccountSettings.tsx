"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { FormError, Notice } from "@/components/dashboard/ui";
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
import { MY_DATA_EXPORT, UPDATE_PROFILE } from "@/lib/auth/session";
import { exportFileName, formatExport } from "@/lib/auth/account";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { Button, Field, Input, SectionTitle, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import { placeError } from "@/lib/formErrors";
import { CARD, FIELD_LABEL } from "@/lib/ui";

type Msg = { key: MessageKey; vars?: Record<string, number> };

const sectionCls = `${CARD} space-y-4 p-6`;

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
      <DownloadData locale={locale} />
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

const PROFILE_ORDER = ["displayName"] as const;

function ProfileForm({ locale }: { locale: Locale }) {
  const { user, request, reload } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const fe = useFormErrors<"displayName">("profile", PROFILE_ORDER);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanDisplayName(name);
    setSaved(false);
    if (!clean) return fe.failField("displayName", { key: "auth.error.displayName" });
    setBusy(true);
    fe.clear();
    try {
      await request(UPDATE_PROFILE, { input: { displayName: clean } });
      setName(clean);
      await reload(); // the account menu shows the new name
      setSaved(true);
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "BAD_USER_INPUT") fe.failField("displayName", { key: "auth.error.displayName" });
      else fe.fail({ fields: {}, form: { key: e2.code === "UNAVAILABLE" ? "auth.error.unavailable" : "account.error.generic" } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={sectionCls}>
      <SectionTitle>{t(locale, "account.profile")}</SectionTitle>
      <FormSummary formId="profile" locale={locale} errors={fe.errors} order={PROFILE_ORDER} />
      <p className="text-sm text-muted">
        {t(locale, "account.email")}: <span className="font-medium text-ink">{user?.email}</span>
      </p>
      <Field
        id={fe.id("displayName")}
        label={t(locale, "auth.displayName")}
        hint={t(locale, "auth.displayNameHint")}
        error={fieldMessage(locale, fe.errors, "displayName")}
      >
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              fe.clearField("displayName");
            }}
            maxLength={50}
            autoComplete="nickname"
          />
        )}
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy ? t(locale, "account.saving") : t(locale, "account.save")}
        </Button>
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

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";
const PASSWORD_ORDER: readonly PasswordField[] = ["currentPassword", "newPassword", "confirmPassword"];
/** Which field each client-side problem belongs to. */
const PROBLEM_FIELD = {
  current: "currentPassword",
  password: "newPassword",
  same: "newPassword",
  mismatch: "confirmPassword",
} as const satisfies Record<keyof typeof PROBLEM_KEY, PasswordField>;

function PasswordForm({ locale }: { locale: Locale }) {
  const { user, changePassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const fe = useFormErrors<PasswordField>("password", PASSWORD_ORDER);
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
    if (problem) return fe.failField(PROBLEM_FIELD[problem], { key: PROBLEM_KEY[problem] });
    setBusy(true);
    fe.clear();
    try {
      await changePassword(current, next);
      form.reset();
      setDone(true);
    } catch (err) {
      const e2 = toApiError(err);
      fe.fail(
        e2.code === "RATE_LIMITED"
          ? { fields: {}, form: rateLimitMessage(e2.retryAfter) }
          : placeError(
              e2.code === "BAD_USER_INPUT" ? e2.field : undefined,
              { key: passwordErrorKey(e2.code, e2.field) },
              PASSWORD_ORDER,
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={sectionCls}>
      <SectionTitle>{t(locale, "account.password")}</SectionTitle>
      <p className="text-sm text-muted">{t(locale, "account.passwordHint")}</p>
      <FormSummary formId="password" locale={locale} errors={fe.errors} order={PASSWORD_ORDER} />
      {/* Lets password managers attach the new password to the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={user?.email ?? ""} readOnly />
      <Field
        id={fe.id("currentPassword")}
        label={t(locale, "account.currentPassword")}
        error={fieldMessage(locale, fe.errors, "currentPassword")}
      >
        {(p) => (
          <Input
            {...p}
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            onChange={() => fe.clearField("currentPassword")}
          />
        )}
      </Field>
      <Field
        id={fe.id("newPassword")}
        label={t(locale, "account.newPassword")}
        hint={t(locale, "auth.passwordHint")}
        error={fieldMessage(locale, fe.errors, "newPassword")}
      >
        {(p) => (
          <Input
            {...p}
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            onChange={() => fe.clearField("newPassword")}
          />
        )}
      </Field>
      <Field
        id={fe.id("confirmPassword")}
        label={t(locale, "account.confirmPassword")}
        error={fieldMessage(locale, fe.errors, "confirmPassword")}
      >
        {(p) => (
          <Input
            {...p}
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            onChange={() => fe.clearField("confirmPassword")}
          />
        )}
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy ? t(locale, "account.saving") : t(locale, "account.changePassword")}
        </Button>
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
      <SectionTitle id="sessions-title">
        {t(locale, "account.sessions")}
      </SectionTitle>
      <p className="text-sm text-muted">{t(locale, "account.sessionsHint")}</p>
      {error && <FormError>{t(locale, error)}</FormError>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink">{t(locale, "account.logoutAllConfirm")}</span>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            variant="danger"
          >
            {busy ? t(locale, "account.loggingOut") : t(locale, "account.logoutAllYes")}
          </Button>
          <Button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            variant="quiet"
            size="sm"
          >
            {t(locale, "account.cancel")}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)}>
          {t(locale, "account.logoutAll")}
        </Button>
      )}
    </section>
  );
}

function DownloadData({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      const { myDataExport } = await request(MY_DATA_EXPORT);
      const blob = new Blob([formatExport(myDataExport)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = exportFileName(new Date());
      a.click();
      // Revoke after the click has been handled, or some browsers cancel it.
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (err) {
      const e2 = toApiError(err);
      setError(
        e2.code === "RATE_LIMITED"
          ? rateLimitMessage(e2.retryAfter)
          : { key: e2.code === "UNAVAILABLE" ? "auth.error.unavailable" : "account.error.generic" },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={sectionCls} aria-labelledby="export-title">
      <SectionTitle id="export-title">{t(locale, "account.export")}</SectionTitle>
      <p className="text-sm text-muted">{t(locale, "account.exportHint")}</p>
      {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
      <Button type="button" variant="secondary" onClick={onDownload} disabled={busy} pending={busy}>
        {busy ? t(locale, "account.exporting") : t(locale, "account.exportButton")}
      </Button>
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
        <p className="rounded-box bg-paper px-4 py-3 text-sm text-ink">
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
            <label htmlFor="delete-password" className={FIELD_LABEL}>
              {t(locale, "account.delete.password")}
            </label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setConfirming(false);
              }}
              className="mt-1"
            />
          </div>
          {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-ink">{t(locale, "account.delete.confirm")}</span>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                variant="danger"
              >
                {busy ? t(locale, "account.delete.deleting") : t(locale, "account.delete.yes")}
              </Button>
              <Button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                variant="quiet"
                size="sm"
              >
                {t(locale, "account.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              disabled={!password}
              variant="danger"
            >
              {t(locale, "account.delete.button")}
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
