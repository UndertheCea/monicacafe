"use client";

import { rowFocusTarget } from "@/lib/rowFocus";

// The DOM side of #405. Removable rows carry `data-row="<id>"` and put
// `data-row-action` on the element (a button, or a wrapper around one) that
// focus should land on. Call `focusAfterRemoval(row)` once the removal has
// succeeded but before the row leaves the DOM: when it is gone (now, after a
// re-render, or after a `router.refresh()`), focus moves to the next row's
// action, else the previous row's, else the heading that labels the section.

const ROW = "[data-row]";
const WAIT_MS = 10_000;

/** The first focusable control at or inside a row's `data-row-action`. */
function rowAction(row: Element): HTMLElement | null {
  const act = row.querySelector<HTMLElement>("[data-row-action]");
  if (!act) return null;
  if (act.matches("button, a[href]")) return act;
  return act.querySelector<HTMLElement>("button:not([disabled]), a[href]");
}

/** The heading that labels the row's section (`aria-labelledby`), made focusable. */
function sectionHeading(section: Element | null): HTMLElement | null {
  const id = section?.getAttribute("aria-labelledby");
  const h = id ? document.getElementById(id) : null;
  if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  return h;
}

/** Whether focus has been lost (it sits on the body) rather than moved on by the visitor. */
function focusLost(): boolean {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
}

export function focusAfterRemoval(row: Element | null | undefined): void {
  if (!row || typeof window === "undefined") return;
  const list = row.parentElement;
  const section = row.closest("section");
  const removedId = row.getAttribute("data-row") ?? "";
  const rows = list
    ? Array.from(list.querySelectorAll(`:scope > ${ROW}`)).map((r) => ({
        id: r.getAttribute("data-row") ?? "",
        hasAction: rowAction(r) !== null,
      }))
    : [];
  const target = rowFocusTarget(rows, removedId);

  const land = () => {
    if (!focusLost()) return;
    let el: HTMLElement | null = null;
    if (target.kind === "row" && list?.isConnected) {
      const r = Array.from(list.querySelectorAll(`:scope > ${ROW}`)).find((x) => x.getAttribute("data-row") === target.id);
      el = r ? rowAction(r) : null;
      if (el && (el as HTMLButtonElement).disabled) el = null;
    }
    (el ?? sectionHeading(section))?.focus();
  };

  if (!row.isConnected) return land();
  const observer = new MutationObserver(() => {
    if (row.isConnected) return;
    stop();
    // After the commit that dropped the row; disabled buttons are re-enabled in the same one.
    requestAnimationFrame(land);
  });
  const timer = window.setTimeout(() => stop(), WAIT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
  observer.observe(section ?? document.body, { childList: true, subtree: true });
}
