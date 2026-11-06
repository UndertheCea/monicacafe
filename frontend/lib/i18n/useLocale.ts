"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, localeFromLang, type Locale } from "./dict";

const noSubscribe = () => () => {};

/**
 * Locale for client components rendered without a locale prop (error
 * boundaries): read from `<html lang>`. The server snapshot is the default,
 * so hydration matches and the real locale applies right after.
 */
export function useHtmlLocale(): Locale {
  return useSyncExternalStore(
    noSubscribe,
    () => localeFromLang(document.documentElement.lang),
    () => DEFAULT_LOCALE,
  );
}
