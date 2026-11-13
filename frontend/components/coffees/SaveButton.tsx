"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { COFFEE_SAVED, SAVE_COFFEE, UNSAVE_COFFEE } from "@/lib/api";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { settleSave, toggleSave, type SaveState } from "@/lib/saved";
import { Button } from "@/components/ui";

/**
 * "收藏 / Save" toggle with the number of saves. The page is rendered
 * anonymously, so the viewer's own state is fetched here once signed in; the
 * toggle is optimistic and rolls back if the API refuses.
 */
export function SaveButton({ coffeeId, saveCount, locale }: { coffeeId: string; saveCount: number; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const [state, setState] = useState<SaveState>({ saved: false, count: saveCount });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    request(COFFEE_SAVED, { id: coffeeId })
      .then((r) => {
        if (live && r.coffee) setState({ saved: r.coffee.isSaved, count: r.coffee.saveCount });
      })
      .catch(() => {
        // Keep the server-rendered count; the button still works.
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [status, request, coffeeId]);

  const count = (
    <span className="text-xs font-normal text-muted">
      {t(locale, "save.count", { n: state.count })}
    </span>
  );

  if (status !== "authenticated") {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-3">
        {status === "anonymous" ? (
          <Button href={`/login?next=${encodeURIComponent(pathname)}`} variant="secondary">
            <span aria-hidden>♡</span> {t(locale, "save.loginToSave")}
          </Button>
        ) : null}
        {count}
      </p>
    );
  }

  async function onToggle() {
    if (busy) return;
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
          onClick={onToggle}
          disabled={busy || !loaded}
          aria-pressed={state.saved}
          variant={state.saved ? "primary" : "secondary"}
        >
          <span aria-hidden>{state.saved ? "♥" : "♡"}</span>
          {t(locale, state.saved ? "save.saved" : "save.save")}
        </Button>
        {count}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(locale, error.key, error.vars)}
        </p>
      )}
    </div>
  );
}
