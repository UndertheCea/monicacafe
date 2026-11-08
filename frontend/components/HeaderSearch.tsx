"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent } from "react";
import { SEARCH_MAX_CHARS, parseSearchParam, searchHref } from "@/lib/coffeeQuery";
import { t, type Locale } from "@/lib/i18n/dict";

const inputCls =
  "w-36 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:w-48 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink transition-[width] lg:w-44 lg:focus:w-56";

/**
 * Header search: a plain GET form to /coffees (works without JavaScript). With
 * JavaScript it navigates client-side and drops a blank `?q=`. Prefilled with
 * the current search on /coffees.
 */
export function HeaderSearch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const current = pathname === "/coffees" ? (parseSearchParam(params.get("q") ?? undefined) ?? "") : "";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    router.push(searchHref(typeof q === "string" ? q : undefined));
  }

  return (
    <HeaderSearchForm locale={locale} defaultValue={current} onSubmit={submit} key={current} />
  );
}

/** The bare form; also the Suspense fallback while search params are read. */
export function HeaderSearchForm({
  locale,
  defaultValue = "",
  onSubmit,
}: {
  locale: Locale;
  defaultValue?: string;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form role="search" method="get" action="/coffees" onSubmit={onSubmit} className="hidden sm:block">
      <label>
        <span className="sr-only">{t(locale, "nav.search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          maxLength={SEARCH_MAX_CHARS}
          placeholder={t(locale, "nav.searchPlaceholder")}
          className={inputCls}
        />
      </label>
    </form>
  );
}
