"use client";

import type { ComponentProps, RefObject } from "react";
import { Button } from "@/components/ui";
import { retryFocusStep } from "@/lib/retryFocus";
import { t, type Locale } from "@/lib/i18n/dict";

const WAIT_MS = 15_000;

/** The heading that labels the retry's section: its `aria-labelledby`, else the first heading in it. */
function headingOf(scope: Element): HTMLElement | null {
  const id = scope.getAttribute("aria-labelledby");
  const h = (id && document.getElementById(id)) || scope.querySelector<HTMLElement>("h1, h2, h3");
  if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  return h;
}

function focusLost(): boolean {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
}

/**
 * Keeps focus in the section while "Try again" reloads it (#512): on its heading while loading, on the next
 * "Try again" if the retry fails again. Stops when the visitor moves focus elsewhere, or after 15 s.
 */
function followRetry(button: HTMLElement, target: HTMLElement | null): void {
  const scope = button.closest("section, main") ?? document.body;
  const heading = target ?? headingOf(scope);
  const step = () => {
    const again = Array.from(scope.querySelectorAll<HTMLElement>("[data-retry]")).find((b) => b !== button && b.isConnected);
    const s = retryFocusStep({
      focusLost: focusLost(),
      onHeading: heading !== null && document.activeElement === heading,
      hasRetry: again !== undefined,
    });
    if (s === "retry") {
      again?.focus();
      stop();
    } else if (s === "heading") {
      if (heading) heading.focus();
      else stop();
    } else if (s === "stop") stop();
  };
  const observer = new MutationObserver(() => requestAnimationFrame(step));
  const timer = window.setTimeout(() => stop(), WAIT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
  observer.observe(scope, { childList: true, subtree: true });
}

/** "Try again" after a failed load: the one retry button, so every one keeps focus (#512). */
export function RetryButton({
  locale,
  onRetry,
  focusTo,
  size,
  className,
}: {
  locale: Locale;
  onRetry: () => void;
  /** Where focus waits while reloading, instead of the section's heading (the Save / Follow toggle). */
  focusTo?: RefObject<HTMLElement | null>;
} & Pick<ComponentProps<"button">, "className"> & Pick<ComponentProps<typeof Button>, "size">) {
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      data-retry
      onClick={(e) => {
        followRetry(e.currentTarget, focusTo?.current ?? null);
        onRetry();
      }}
    >
      {t(locale, "crash.retry")}
    </Button>
  );
}
