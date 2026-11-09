"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { INLINE_SIDEBAR_QUERY } from "@/lib/drawer";
import { Drawer } from "@/components/Drawer";

interface Props {
  /** The toggle's text below md, e.g. "Filters (2)". */
  summary: string;
  /** The drawer's heading ("Filters"). */
  title: string;
  closeLabel: string;
  children: ReactNode;
}

const noSubscribe = () => () => {};

const toggleCls =
  "flex w-full cursor-pointer items-center justify-between rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-ink ring-1 ring-neutral-200 md:hidden";

// md+ (tablets, half-width windows, desktop): the filter form is a sidebar,
// always shown. Below md: a "Filters (N)" button opens it in a side drawer
// (#165). Without JavaScript the button is a CSS-only toggle (a visually
// hidden checkbox + its label) that unfolds the form in place, as in #153; the
// checkbox sits outside the form, so it's never submitted.
export function FilterPanel({ summary, title, closeLabel, children }: Props) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);

  // Widening the window to md+ shows the sidebar inline, so the drawer goes.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(INLINE_SIDEBAR_QUERY);
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  return (
    <div>
      {hydrated ? (
        <button
          type="button"
          className={toggleCls}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen(true)}
        >
          {summary}
          <span aria-hidden="true" className="text-neutral-500">
            ☰
          </span>
        </button>
      ) : (
        <>
          <input id="filter-toggle" type="checkbox" aria-controls="filter-panel" className="peer sr-only md:hidden" />
          <label
            htmlFor="filter-toggle"
            className={`${toggleCls} peer-checked:[&>span]:rotate-180 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink`}
          >
            {summary}
            <span aria-hidden="true" className="text-neutral-500 transition">
              ▾
            </span>
          </label>
        </>
      )}
      <Drawer
        id="filter-panel"
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        closeLabel={closeLabel}
        inlineClassName="mt-3 hidden peer-checked:block md:mt-0 md:block"
      >
        {children}
      </Drawer>
    </div>
  );
}
