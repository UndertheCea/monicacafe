import type { ReactNode } from "react";

/**
 * The one page container (#229): every route's top-level content sits in it, so the left and right edges line up
 * from page to page (and with the header and footer). Narrow forms keep an inner max-width for the form itself.
 */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`.trim()}>{children}</div>;
}
