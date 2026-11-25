"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nextLoadKey, ownStateAfterLoad, ownStateOnStatus, toggleEnabled, type OwnStateLoad } from "@/lib/retry";
import { useAuth } from "@/components/auth/AuthProvider";
import { COFFEE_SAVED, SAVE_COFFEE, UNSAVE_COFFEE } from "@/lib/api";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { settleSave, toggleSave, type SaveState } from "@/lib/saved";
import { loginHrefFrom, showSignInLink } from "@/lib/navMenu";
import { Button } from "@/components/ui";
import { RetryButton } from "@/components/RetryButton";

/**
 * "收藏 / Save" toggle with the number of saves. The page is rendered
 * anonymously, so the viewer's own state is fetched here once signed in; the
 * toggle is optimistic and rolls back if the API refuses.
 */
export function SaveButton({ coffeeId, saveCount, locale }: { coffeeId: string; saveCount: number; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<SaveState>({ saved: false, count: saveCount });
  const [load, setLoad] = useState<OwnStateLoad>("loading");
  const [loadKey, setLoadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    request(COFFEE_SAVED, { id: coffeeId })
      .then((r) => {
        if (live && r.coffee) setState({ saved: r.coffee.isSaved, count: r.coffee.saveCount });
      })
      .then(
        () => live && setLoad(ownStateAfterLoad(true)),
        // Not knowing the viewer's state, the toggle would guess; offer "Try again" instead (#443).
        () => live && setLoad(ownStateAfterLoad(false)),
      );
    return () => {
      live = false;
    };
  }, [status, request, coffeeId, loadKey]);
  // Signed out (in this tab or another): forget "ready" so a later sign-in waits for its own fetch (#470).
  const settled = ownStateOnStatus(load, status);
  if (settled !== load) setLoad(settled);

  const count = (
    <span className="text-xs font-normal text-muted">
      {t(locale, "save.count", { n: state.count })}
    </span>
  );

  if (status !== "authenticated") {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-3">
        {showSignInLink(status) ? (
          <Button href={loginHrefFrom(pathname, search)} variant="secondary">
            <span aria-hidden>♡</span> {t(locale, "save.loginToSave")}
          </Button>
        ) : null}
        {count}
      </p>
    );
  }

  async function onToggle() {
    if (!toggleEnabled(load, busy)) return; // aria-disabled keeps focus on the button, so guard here (#423)
    const before = state;
    const guess = toggleSave(state, !state.saved);
    setState(guess);
    setBusy(true);
    setError(null);
    try {
      const result = guess.saved
        ? (await request(SAVE_COFFEE, { id: coffeeId })).saveCoffee
        : (await request(UNSAVE_COFFEE, { id: coffeeId })).unsaveCoffee;
      setState(settleSave(guess, result));
    } catch (err) {
      setState(before);
      const e = toApiError(err);
      setError(e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : { key: "save.error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="flex flex-wrap items-center gap-3">
        <Button
          ref={toggleRef}
          onClick={onToggle}
          aria-disabled={!toggleEnabled(load, busy)}
          className={toggleEnabled(load, busy) ? undefined : "opacity-50"}
          aria-pressed={state.saved}
          variant={state.saved ? "primary" : "secondary"}
        >
          <span aria-hidden>{state.saved ? "♥" : "♡"}</span>
          {t(locale, state.saved ? "save.saved" : "save.save")}
        </Button>
        {count}
      </p>
      {load === "failed" && (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-danger">
          {t(locale, "save.loadError")}
          <RetryButton
            locale={locale}
            focusTo={toggleRef}
            onRetry={() => {
              setLoad("loading");
              setLoadKey(nextLoadKey);
            }}
          />
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(locale, error.key, error.vars)}
        </p>
      )}
    </div>
  );
}
