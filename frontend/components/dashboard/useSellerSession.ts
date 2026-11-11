"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SessionUser } from "@/lib/auth/session";
import { sellerSessionView, shouldConfirmLeave } from "@/lib/dashboard/session";

/**
 * useAuth() for dashboard forms (#228): when the session ends while a form is
 * open, `view` is "locked" and `user` stays the last signed-in user, so the
 * form can stay mounted (typed values kept) under <SignInAgain>.
 */
export function useSellerSession() {
  const auth = useAuth();
  const [lastUser, setLastUser] = useState<SessionUser | null>(null);
  // Adjusting state while rendering (React's documented pattern for derived state).
  if (auth.user && auth.user !== lastUser) setLastUser(auth.user);
  const view = sellerSessionView(auth.status, lastUser !== null);
  return { ...auth, view, user: auth.user ?? (view === "locked" ? lastUser : null) };
}

// Forms with unsaved changes on the page; one set of listeners serves them all.
const dirtyForms = new Set<symbol>();
let messageText = "";

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = ""; // older browsers need it to show the prompt
}

function onClickCapture(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0) return;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  const leave = shouldConfirmLeave(a.href, window.location.href, {
    modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
    target: a.getAttribute("target"),
    download: a.hasAttribute("download"),
  });
  if (leave && !window.confirm(messageText)) {
    e.preventDefault();
    e.stopPropagation(); // keeps next/link from navigating
  }
}

/**
 * Asks before leaving a form with unsaved changes (#228): the browser's own
 * prompt on reload / close, and a confirm() on in-app links (dashboard, header
 * drawer). Submitting the form itself navigates with router.push, which this
 * doesn't intercept.
 */
export function useUnsavedChanges(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol("form");
    messageText = message;
    if (dirtyForms.size === 0) {
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("click", onClickCapture, true);
    }
    dirtyForms.add(id);
    return () => {
      dirtyForms.delete(id);
      if (dirtyForms.size === 0) {
        window.removeEventListener("beforeunload", onBeforeUnload);
        document.removeEventListener("click", onClickCapture, true);
      }
    };
  }, [dirty, message]);
}
