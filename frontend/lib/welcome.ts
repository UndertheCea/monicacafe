// A one-time "Welcome, name" greeting after registering (pure, so `npm test` can check it).
// AuthForm leaves the name in sessionStorage before redirecting; <WelcomeNotice> reads and clears it.

export const WELCOME_KEY = "moni.welcome";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Remembers the new member's name for the next page. Storage can be blocked: failures are ignored. */
export function rememberWelcome(store: Store | undefined, name: string): void {
  const n = name.trim();
  if (!store || !n) return;
  try {
    store.setItem(WELCOME_KEY, n);
  } catch {
    /* private mode: no greeting */
  }
}

/** The remembered name, once: it is cleared as it is read. */
export function takeWelcome(store: Store | undefined): string | null {
  if (!store) return null;
  try {
    const n = store.getItem(WELCOME_KEY);
    if (n === null) return null;
    store.removeItem(WELCOME_KEY);
    return n.trim() || null;
  } catch {
    return null;
  }
}
