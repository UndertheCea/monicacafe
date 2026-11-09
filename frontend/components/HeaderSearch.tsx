"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent } from "react";
import { SEARCH_MAX_CHARS, parseSearchParam, searchHref } from "@/lib/coffeeQuery";
import { t, type Locale } from "@/lib/i18n/dict";

/** "row": in the full header row (lg+); "panel": full width in the phone / tablet search panel (#175). */
export type SearchVariant = "row" | "panel";

const baseInputCls =
  "rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const inputCls: Record<SearchVariant, string> = {
  row: `${baseInputCls} w-44 transition-[width] focus:w-56`,
  panel: `${baseInputCls} w-full py-2 text-base`,
};

/**
 * Header search: a plain GET form to /coffees (works without JavaScript). With
 * JavaScript it navigates client-side and drops a blank `?q=`. Prefilled with
 * the current search on /coffees.
 */
export function HeaderSearch({
  locale,
  variant = "row",
  onDone,
}: {
  locale: Locale;
  variant?: SearchVariant;
  /** Called after a search is submitted (the phone search panel closes). */
  onDone?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const current = pathname === "/coffees" ? (parseSearchParam(params.get("q") ?? undefined) ?? "") : "";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    router.push(searchHref(typeof q === "string" ? q : undefined));
    onDone?.();
  }

  return (
    <HeaderSearchForm locale={locale} variant={variant} defaultValue={current} onSubmit={submit} key={current} />
  );
}

/** The bare form; also the Suspense fallback while search params are read. */
export function HeaderSearchForm({
  locale,
  variant = "row",
  defaultValue = "",
  onSubmit,
}: {
  locale: Locale;
  variant?: SearchVariant;
  defaultValue?: string;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form role="search" method="get" action="/coffees" onSubmit={onSubmit} className={variant === "panel" ? "block w-full" : "block"}>
      <label className="block">
        <span className="sr-only">{t(locale, "nav.search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          maxLength={SEARCH_MAX_CHARS}
          placeholder={t(locale, "nav.searchPlaceholder")}
          className={inputCls[variant]}
        />
      </label>
    </form>
  );
}
