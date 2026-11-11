"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { validateCredentials } from "@/lib/auth/token";
import { authErrorMessage, type AuthErrorMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { FormError, inputCls } from "./ui";

/**
 * Inline sign-in shown above a dashboard form whose session ended (#228). The
 * form below stays mounted, so after signing in here (no navigation) every
 * typed value is still there and Save works. Not a <form>, because it can sit
 * next to the seller's form and must never submit it.
 */
export function SignInAgain({ locale, email: knownEmail }: { locale: Locale; email?: string | null }) {
  const { login } = useAuth();
  const [email, setEmail] = useState(knownEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorMessage | null>(null);

  async function submit() {
    const problem = validateCredentials(email, password);
    if (problem) return setError({ key: problem === "email" ? "auth.error.email" : "auth.error.password" });
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const e2 = toApiError(err);
      setError(authErrorMessage("login", e2.code, e2.field, e2.retryAfter));
      setBusy(false);
    }
  }

  return (
    <section
      role="alert"
      aria-labelledby="signin-again-title"
      className="space-y-3 rounded-2xl bg-white p-5 ring-2 ring-ink"
    >
      <h2 id="signin-again-title" className="font-bold text-ink">
        {t(locale, "dash.sessionLost")}
      </h2>
      <p className="text-sm text-muted">{t(locale, "dash.sessionLostHint")}</p>
      {error && <FormError>{t(locale, error.key, "vars" in error ? error.vars : undefined)}</FormError>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium text-ink">
          {t(locale, "auth.email")}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          {t(locale, "auth.password")}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            className={inputCls}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/80 disabled:opacity-60"
        >
          {t(locale, busy ? "auth.submitting" : "auth.submitLogin")}
        </button>
      </div>
    </section>
  );
}
