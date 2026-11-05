"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { toApiError } from "@/lib/graphql";
import { safeNext, validateCredentials } from "@/lib/auth/token";
import { authErrorMessage, type AuthErrorMessage } from "@/lib/errors";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "register";

const inputCls =
  "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

export function AuthForm({ mode, locale }: { mode: Mode; locale: Locale }) {
  const auth = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === "authenticated" && auth.user && !busy) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
        <p className="text-stone-700">{t(locale, "auth.alreadyIn", { name: auth.user.displayName })}</p>
        <Link
          href={next}
          className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-700"
        >
          {t(locale, "auth.continue")}
        </Link>
      </div>
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
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {t(locale, error.key, "vars" in error ? error.vars : undefined)}
        </p>
      )}
      {mode === "register" && (
        <label className="block text-sm font-medium text-stone-700">
          {t(locale, "auth.displayName")}
          <input name="displayName" required maxLength={50} autoComplete="nickname" className={inputCls} />
          <span className="mt-1 block text-xs font-normal text-stone-500">{t(locale, "auth.displayNameHint")}</span>
        </label>
      )}
      <label className="block text-sm font-medium text-stone-700">
        {t(locale, "auth.email")}
        <input name="email" type="email" required autoComplete="email" className={inputCls} />
      </label>
      <label className="block text-sm font-medium text-stone-700">
        {t(locale, "auth.password")}
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputCls}
        />
        {mode === "register" && (
          <span className="mt-1 block text-xs font-normal text-stone-500">{t(locale, "auth.passwordHint")}</span>
        )}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-stone-900 px-5 py-2.5 font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60"
      >
        {busy ? t(locale, "auth.submitting") : t(locale, mode === "login" ? "auth.submitLogin" : "auth.submitRegister")}
      </button>
      <p className="text-center text-sm text-stone-600">
        {t(locale, mode === "login" ? "auth.noAccount" : "auth.haveAccount")}{" "}
        <Link
          href={`/${mode === "login" ? "register" : "login"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-amber-700 hover:underline"
        >
          {t(locale, mode === "login" ? "auth.toRegister" : "auth.toLogin")}
        </Link>
      </p>
    </form>
  );
}
