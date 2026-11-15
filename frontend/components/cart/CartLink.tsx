"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cartBadgeText } from "@/lib/cart";
import { CART } from "@/lib/cartQueries";
import { getCartSnapshot, getServerCartSnapshot, setCartSnapshot, subscribeCart } from "@/lib/cartStore";
import { t, type Locale } from "@/lib/i18n/dict";
import { ICON_BUTTON } from "@/lib/ui";

/**
 * The header's cart link (#311): a bag icon with the number of bags in plain
 * type. Only signed-in visitors see it (signed-out visitors make no request
 * for it). The count comes from the shared cart snapshot, which the coffee
 * page and /cart update after every add, change and remove.
 */
export function CartLink({ locale }: { locale: Locale }) {
  const { status, request } = useAuth();
  const cart = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);
  const authenticated = status === "authenticated";

  useEffect(() => {
    if (!authenticated) {
      setCartSnapshot(null);
      return;
    }
    if (getCartSnapshot()) return;
    let live = true;
    request(CART, {}).then(
      (r) => live && setCartSnapshot(r.cart),
      () => {}, // The link still works without a count.
    );
    return () => {
      live = false;
    };
  }, [authenticated, request]);

  if (!authenticated) return null;
  const count = cart?.itemCount ?? 0;
  const badge = cartBadgeText(count);
  return (
    <Link
      href="/cart"
      aria-label={t(locale, "nav.cartCount", { n: count })}
      className={ICON_BUTTON.replace("w-11", "min-w-11 gap-1 px-3")}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4.5 7h11l-.8 9.5h-9.4L4.5 7Z" strokeLinejoin="round" />
        <path d="M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" strokeLinecap="round" />
      </svg>
      {badge && <span className="text-sm font-semibold tabular-nums">{badge}</span>}
    </Link>
  );
}
