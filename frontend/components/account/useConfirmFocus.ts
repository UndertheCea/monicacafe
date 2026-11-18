"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { confirmFocusTarget, type ConfirmStep } from "@/lib/auth/account";

/**
 * Focus for the /account confirm rows (#389): Yes gets focus when the row opens (or a failed action re-enables it),
 * the trigger gets it back on Cancel / Esc / failure. `close(true)` asks for focus back; `close(false)` doesn't.
 */
export function useConfirmFocus(confirming: boolean, busy: boolean, setConfirming: (v: boolean) => void) {
  const yes = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const prev = useRef<ConfirmStep>({ confirming, busy });
  const returnFocus = useRef(false);

  useEffect(() => {
    const target = confirmFocusTarget(prev.current, { confirming, busy }, returnFocus.current);
    prev.current = { confirming, busy };
    returnFocus.current = false;
    if (target === "yes") yes.current?.focus();
    else if (target === "trigger") trigger.current?.focus();
  }, [confirming, busy]);

  function close(refocus: boolean) {
    returnFocus.current = refocus;
    setConfirming(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      close(true);
    }
  }

  return { yes, trigger, close, onKeyDown };
}
