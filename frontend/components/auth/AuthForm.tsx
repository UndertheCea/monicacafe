"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { toApiError } from "@/lib/graphql";
import { safeNext, validateCredentials } from "@/lib/auth/token";
import { authErrorMessage, type AuthErrorMessage } from "@/lib/errors";
import { useAuth } from "./AuthProvider";
import { Button, Card, ErrorSummary, Field, Input, useFormErrors } from "@/components/ui";
import { CARD } from "@/lib/ui";
import type { FormErrors } from "@/lib/formErrors";
import { rememberWelcome } from "@/lib/welcome";

type Mode = "login" | "register";
type AuthField = "displayName" | "email" | "password";
const FIELDS: Record<Mode, readonly AuthField[]> = {
  login: ["email", "password"],
  register: ["displayName", "email", "password"],
};

/** Field-specific messages go under their field; the rest (wrong password, rate limit, …) to the summary. */
function placeAuthError(m: AuthErrorMessage): FormErrors<AuthField> {
  const field = { "auth.error.email": "email", "auth.error.password": "password", "auth.error.displayName": "displayName" }[
    m.key as string
  ] as AuthField | undefined;
  return field ? { fields: { [field]: m } } : { fields: {}, form: m };
}

export function AuthForm({ mode, locale }: { mode: Mode; locale: Locale }) {
  const auth = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const formId = `auth-${mode}`;
  const fe = useFormErrors<AuthField>(formId, FIELDS[mode]);
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
      fe.failField(bad, { key: `auth.error.${bad}` });
      return;
    }
    if (mode === "login" && !password) {
      fe.fail({ fields: {}, form: { key: "auth.error.invalid" } });
      return;
    }
    setBusy(true);
    fe.clear();
    try {
      if (mode === "login") await auth.login(email, password);
      else {
        await auth.register(email, password, displayName ?? "");
        rememberWelcome(window.sessionStorage, displayName ?? ""); // one-time greeting (WelcomeNotice)
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      const e2 = toApiError(err);
      fe.fail(placeAuthError(authErrorMessage(mode, e2.code, e2.field, e2.retryAfter)));
      setBusy(false);
    }
  }

  const msg = (f: AuthField) => {
    const m = fe.errors.fields[f];
    return m ? t(locale, m.key as MessageKey, m.vars) : undefined;
  };

  return (
    <form onSubmit={onSubmit} noValidate className={`${CARD} space-y-4 p-6`}>
      {(fe.errors.form || fe.first) && (
        <ErrorSummary
          formId={formId}
          message={
            fe.errors.form
              ? t(locale, fe.errors.form.key as MessageKey, fe.errors.form.vars)
              : t(locale, "form.fixFields", { n: Object.values(fe.errors.fields).filter(Boolean).length })
          }
          firstFieldId={fe.first && fe.id(fe.first)}
          jumpLabel={fe.first && t(locale, "form.jumpFirst")}
        />
      )}
      {mode === "register" && (
        <Field
          id={fe.id("displayName")}
          label={t(locale, "auth.displayName")}
          hint={t(locale, "auth.displayNameHint")}
          error={msg("displayName")}
        >
          {(p) => <Input {...p} name="displayName" required maxLength={50} autoComplete="nickname" />}
        </Field>
      )}
      <Field id={fe.id("email")} label={t(locale, "auth.email")} error={msg("email")}>
        {(p) => <Input {...p} name="email" type="email" required autoComplete="email" />}
      </Field>
      <Field
        id={fe.id("password")}
        label={t(locale, "auth.password")}
        hint={mode === "register" ? t(locale, "auth.passwordHint") : undefined}
        error={msg("password")}
      >
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        )}
      </Field>
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
