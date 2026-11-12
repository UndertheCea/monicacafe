"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { toApiError } from "@/lib/graphql";
import { safeNext, validateCredentials } from "@/lib/auth/token";
import { authErrorMessage, type AuthErrorMessage } from "@/lib/errors";
import { useAuth } from "./AuthProvider";
import { Button, Card, Input } from "@/components/ui";
import { CARD, FIELD_LABEL } from "@/lib/ui";

type Mode = "login" | "register";

export function AuthForm({ mode, locale }: { mode: Mode; locale: Locale }) {
  const auth = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === "authenticated" && auth.user && !busy) {
    return (
      <Card className="p-6 text-center">
        <p className="text-ink">{t(locale, "auth.alreadyIn", { name: auth.user.displayName })}</p>
        <Button
          href={next}
          className="mt-4 inline-block"
        >
          {t(locale, "auth.continue")}
        </Button>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const displayName = mode === "register" ? String(fd.get("displayName") ?? "").trim() : undefined;
    const bad = validateCredentials(email, mode === "login" ? null : password, displayName);
    if (bad) {
      setError({ key: `auth.error.${bad}` });
      return;
    }
    if (mode === "login" && !password) {
      setError({ key: "auth.error.invalid" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(email, password, displayName ?? "");
      router.replace(next);
      router.refresh();
    } catch (err) {
      const e2 = toApiError(err);
      setError(authErrorMessage(mode, e2.code, e2.field, e2.retryAfter));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`${CARD} space-y-4 p-6`}>
      {error && (
        <p role="alert" className="rounded-box bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-danger/30">
          {t(locale, error.key, "vars" in error ? error.vars : undefined)}
        </p>
      )}
      {mode === "register" && (
        <label className={FIELD_LABEL}>
          {t(locale, "auth.displayName")}
          <Input name="displayName" required maxLength={50} autoComplete="nickname" className="mt-1" />
          <span className="mt-1 block text-xs font-normal text-muted">{t(locale, "auth.displayNameHint")}</span>
        </label>
      )}
      <label className={FIELD_LABEL}>
        {t(locale, "auth.email")}
        <Input name="email" type="email" required autoComplete="email" className="mt-1" />
      </label>
      <label className={FIELD_LABEL}>
        {t(locale, "auth.password")}
        <Input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="mt-1"
        />
        {mode === "register" && (
          <span className="mt-1 block text-xs font-normal text-muted">{t(locale, "auth.passwordHint")}</span>
        )}
      </label>
      <Button type="submit" disabled={busy} full>
        {busy ? t(locale, "auth.submitting") : t(locale, mode === "login" ? "auth.submitLogin" : "auth.submitRegister")}
      </Button>
      <p className="text-center text-sm text-muted">
        {t(locale, mode === "login" ? "auth.noAccount" : "auth.haveAccount")}{" "}
        <Link
          href={`/${mode === "login" ? "register" : "login"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-ink underline-offset-4 hover:underline"
        >
          {t(locale, mode === "login" ? "auth.toRegister" : "auth.toLogin")}
        </Link>
      </p>
    </form>
  );
}
