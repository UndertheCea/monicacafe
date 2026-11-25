"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ButtonSize } from "@/lib/ui";
import { Button } from "./Button";

/**
 * The one way to confirm a destructive action (#232). The first click turns the button into
 * "<question> [confirm] [cancel]"; the second click acts. Esc, Cancel or moving focus out of the group cancels.
 * Replaces window.confirm everywhere.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  cancelLabel,
  onConfirm,
  busy = false,
  disabled = false,
  size = "sm",
  variant = "quiet",
  className,
}: {
  /** The resting button's label ("刪除", "下架"). */
  children: ReactNode;
  /** Shown while confirming ("確定刪除？"). */
  question: string;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
  variant?: "quiet" | "secondary" | "danger";
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const group = useRef<HTMLSpanElement>(null);
  const yes = useRef<HTMLButtonElement>(null);
  const rest = useRef<HTMLButtonElement>(null);
  // "cancel": always refocus the resting button. "confirmed": refocus it once it is enabled again, but only if
  // focus was lost (the yes-button unmounted, #488); a visitor who moved on keeps their place.
  const returnFocus = useRef<false | "cancel" | "confirmed">(false);
  const resting = !disabled && !busy;

  useEffect(() => {
    if (confirming) {
      yes.current?.focus();
      return;
    }
    const mode = returnFocus.current;
    if (!mode || !resting) return; // still busy: try again when it settles
    returnFocus.current = false;
    const a = document.activeElement;
    if (mode === "cancel" || !a || a === document.body) rest.current?.focus();
  }, [confirming, resting]);

  function cancel(refocus: boolean) {
    returnFocus.current = refocus ? "cancel" : false;
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <Button
        ref={rest}
        variant={variant}
        size={size}
        disabled={disabled}
        pending={busy}
        className={className}
        onClick={() => setConfirming(true)}
      >
        {children}
      </Button>
    );
  }
  return (
    <span
      ref={group}
      role="group"
      aria-label={question}
      className={`inline-flex flex-wrap items-center gap-2 ${className ?? ""}`.trim()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel(true);
        }
      }}
      onBlur={(e) => {
        if (!group.current?.contains(e.relatedTarget as Node | null)) cancel(false);
      }}
    >
      <span className="text-sm text-danger">{question}</span>
      <Button
        ref={yes}
        variant="danger"
        size={size}
        onClick={() => {
          returnFocus.current = "confirmed";
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="secondary" size={size} onClick={() => cancel(true)}>
        {cancelLabel}
      </Button>
    </span>
  );
}
