"use client";

import { useLinkStatus } from "next/link";

/**
 * A small dot after a link's text while its page loads (#156). The list
 * pages have no loading boundary (it hid their content from browsers without
 * JavaScript), so this is the feedback for a slow client-side navigation.
 * Must be rendered inside a next/link <Link>. Black only (rule 11).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`ml-1 inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle transition-opacity ${pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"}`}
    />
  );
}
