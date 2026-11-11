"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { isOutside } from "@/lib/drawer";

interface Props {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Visible heading inside the panel (also its accessible name). */
  title: string;
  /** The close button's label. */
  closeLabel: string;
  /**
   * Classes for the closed state. A closed <dialog> is display:none; pass e.g.
   * "md:block" to show the same content inline at some widths (the /coffees
   * sidebar) or "peer-checked:block" for a no-JavaScript fallback.
   */
  inlineClassName?: string;
  children: ReactNode;
}

/**
 * A white panel that slides in from the left over the page dimmed with
 * black/40 (#165, #175). A modal <dialog>, so the browser traps focus, keeps
 * the page inert, closes on Esc and returns focus to the opener. The backdrop
 * and the close button close it too, and the page doesn't scroll behind it.
 * Black and white only (rule 11): the dim is the only tint, with no blur.
 */
export function Drawer({ id, open, onClose, title, closeLabel, inlineClassName = "", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `${id}-title`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const html = document.documentElement;
      const prev = html.style.overflow;
      html.style.overflow = "hidden";
      return () => {
        html.style.overflow = prev;
        if (d.open) d.close();
      };
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={open ? titleId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault(); // Esc: let React state close it, so open stays in step
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || e.detail === 0) return; // only pointer clicks on the backdrop
        if (isOutside(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) onClose();
      }}
      className={`group max-h-none max-w-none border-0 bg-transparent p-0 text-ink [&:not([open])]:static [&:not([open])]:w-auto ${inlineClassName} open:fixed open:block open:inset-y-0 open:left-0 open:right-auto open:m-0 open:h-dvh open:w-[85vw] open:max-w-[24rem] sm:open:w-[24rem] open:overflow-y-auto open:bg-white open:p-4 motion-safe:open:animate-[drawer-in_160ms_ease-out] backdrop:bg-black/40`}
    >
      <div className="mb-3 hidden items-center justify-between group-open:flex">
        <h2 id={titleId} className="text-base font-bold text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg leading-none text-ink hover:border-muted"
          aria-label={closeLabel}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {children}
    </dialog>
  );
}
