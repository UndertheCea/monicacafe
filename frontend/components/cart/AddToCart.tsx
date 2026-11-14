"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cartErrorKey, quantityChoices } from "@/lib/cart";
import { ADD_TO_CART } from "@/lib/cartQueries";
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

type Note = { kind: "added" } | { kind: "error"; key: MessageKey; vars?: Record<string, number> };

/**
 * Option + quantity + "加入購物車 / Add to cart" on the coffee page (#280).
 * Only options on sale with stock are offered; signed-out visitors get a
 * sign-in link that comes back here. The page itself is rendered anonymously.
 */
export function AddToCart({ variants, locale }: { variants: BuyableVariant[]; locale: Locale }) {
  const { status, request } = useAuth();
  const pathname = usePathname();
  const buyable = variants.filter((v) => v.isAvailable && v.stock > 0);
  const [variantId, setVariantId] = useState(buyable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  if (buyable.length === 0) return null;
  if (status === "anonymous") {
    return (
      <p className="mt-4">
        <Button href={`/login?next=${encodeURIComponent(pathname)}`} variant="secondary">
          {t(locale, "cart.loginToBuy")}
        </Button>
      </p>
    );
  }

  const chosen = buyable.find((v) => v.id === variantId) ?? buyable[0];
  const choices = quantityChoices(chosen.stock);
  const qty = Math.min(quantity, choices.length);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await request(ADD_TO_CART, { variantId: chosen.id, quantity: qty });
      setNote({ kind: "added" });
    } catch (err) {
      const e2 = toApiError(err);
      setNote(
        e2.code === "RATE_LIMITED"
          ? { kind: "error", ...rateLimitMessage(e2.retryAfter) }
          : { kind: "error", key: cartErrorKey(e2.code, e2.field) },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block min-w-0 flex-1 text-xs font-medium text-muted">
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
          {choices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" pending={busy} disabled={status !== "authenticated"}>
        {t(locale, "cart.add")}
      </Button>
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
