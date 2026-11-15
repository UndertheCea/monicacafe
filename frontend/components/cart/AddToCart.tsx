"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { bagsLeft, cartLoginHref, cartProblem, inCartFor, parseCartChoice, type CartProblem } from "@/lib/cart";
import { ADD_TO_CART, CART } from "@/lib/cartQueries";
import { getCartSnapshot, getServerCartSnapshot, setCartSnapshot, subscribeCart } from "@/lib/cartStore";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { Button, Select } from "@/components/ui";

export interface BuyableVariant {
  id: string;
  grind: string;
  weightG: number;
  priceTwd: number;
  stock: number;
  isAvailable: boolean;
}

type Note = { kind: "added" } | ({ kind: "error" } & CartProblem);

/**
 * Option + quantity + "加入購物車 / Add to cart" on the coffee page (#280).
 * Only options on sale with stock are offered; signed-out visitors get a
 * sign-in link that comes back here with the same option and quantity. The
 * page itself is rendered anonymously and its stock can be a minute old, so
 * the quantity picker offers stock minus what the cart already holds, and
 * shrinks further when the server reports how many are left.
 */
export function AddToCart({ variants, locale }: { variants: BuyableVariant[]; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const buyable = variants.filter((v) => v.isAvailable && v.stock > 0);
  const [variantId, setVariantId] = useState(buyable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  // Bags left per option as the server last reported them (BAD_USER_INPUT `available`).
  const [known, setKnown] = useState<Record<string, number>>({});
  const cart = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);
  const authenticated = status === "authenticated";
  const ids = buyable.map((v) => v.id).join(",");

  // Back from the login round trip: restore the option and quantity (#311), then tidy the address bar.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("option") && !url.searchParams.has("qty")) return;
    const choice = parseCartChoice(url.search, ids ? ids.split(",") : []);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from the address
    if (choice.variantId) setVariantId(choice.variantId);
    if (choice.quantity) setQuantity(choice.quantity);
    url.searchParams.delete("option");
    url.searchParams.delete("qty");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [ids]);

  // Know what the cart already holds, so the picker is right before the first add.
  useEffect(() => {
    if (!authenticated || getCartSnapshot()) return;
    let live = true;
    request(CART, {}).then(
      (r) => live && setCartSnapshot(r.cart),
      () => {}, // The server still checks every add.
    );
    return () => {
      live = false;
    };
  }, [authenticated, request]);

  if (buyable.length === 0) return null;

  const chosen = buyable.find((v) => v.id === variantId) ?? buyable[0];
  const left = bagsLeft(chosen.stock, cart ? inCartFor(cart.items, chosen.id) : 0, known[chosen.id]);
  const qty = Math.max(1, Math.min(quantity, left));

  if (status === "anonymous") {
    return (
      <p className="mt-4">
        <Button href={cartLoginHref(pathname, chosen.id, qty)} variant="secondary">
          {t(locale, "cart.loginToBuy")}
        </Button>
      </p>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await request(ADD_TO_CART, { variantId: chosen.id, quantity: qty });
      setCartSnapshot(r.addToCart);
      setKnown((k) => Object.fromEntries(Object.entries(k).filter(([id]) => id !== chosen.id)));
      setNote({ kind: "added" });
    } catch (err) {
      const e2 = toApiError(err);
      const quantityRefused = e2.code === "BAD_USER_INPUT" && e2.field === "quantity";
      if (quantityRefused && e2.available !== undefined) {
        const n = e2.available;
        setKnown((k) => ({ ...k, [chosen.id]: n }));
      }
      setNote({
        kind: "error",
        ...(e2.code === "RATE_LIMITED" ? rateLimitMessage(e2.retryAfter) : cartProblem(e2.code, e2.field, e2.available)),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block min-w-0 basis-full text-xs font-medium text-muted sm:basis-0 sm:flex-1">
        {t(locale, "cart.option")}
        <Select
          value={chosen.id}
          onChange={(e) => {
            setVariantId(e.target.value);
            setNote(null);
          }}
          className="mt-1"
        >
          {buyable.map((v) => (
            <option key={v.id} value={v.id}>
              {t(locale, `grind.${v.grind}` as MessageKey)} · {v.weightG} g · NT${formatTWD(v.priceTwd)}
            </option>
          ))}
        </Select>
      </label>
      {left === 0 ? (
        <p className="w-full text-sm text-ink">{t(locale, "cart.allInCart")}</p>
      ) : (
      <>
      <label className="block w-24 text-xs font-medium text-muted">
        {t(locale, "cart.quantity")}
        <Select
          value={qty}
          onChange={(e) => {
            setQuantity(Number(e.target.value));
            setNote(null);
          }}
          className="mt-1"
        >
          {Array.from({ length: left }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" pending={busy} disabled={status !== "authenticated"}>
        {t(locale, "cart.add")}
      </Button>
      </>
      )}
      {note?.kind === "added" && (
        <p role="status" className="w-full text-sm text-ink">
          {t(locale, "cart.added")}{" "}
          <Link href="/cart" className="font-semibold underline underline-offset-4">
            {t(locale, "cart.view")}
          </Link>
        </p>
      )}
      {note?.kind === "error" && (
        <p role="alert" className="w-full text-sm text-danger">
          {t(locale, note.key, note.vars)}
        </p>
      )}
    </form>
  );
}
