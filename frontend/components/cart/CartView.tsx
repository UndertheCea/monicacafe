"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cartErrorKey, groupByShop, quantityChoices, type CartData, type CartLine } from "@/lib/cart";
import { CART, REMOVE_FROM_CART, UPDATE_CART_ITEM } from "@/lib/cartQueries";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { Button, Card, Select, SectionTitle } from "@/components/ui";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; cart: CartData };
type Problem = { key: MessageKey; vars?: Record<string, number> };

/** /cart (#280): lines grouped by shop with quantity, remove and totals. Checkout comes later. */
export function CartView({ locale }: { locale: Locale }) {
  const { status, request } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ line: string; p: Problem } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    request(CART, {}).then(
      (r) => live && setLoad({ state: "ready", cart: r.cart }),
      () => live && setLoad({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [status, request]);

  if (status === "anonymous") {
    return (
      <p>
        <Button href="/login?next=%2Fcart">{t(locale, "cart.loginToBuy")}</Button>
      </p>
    );
  }
  if (status === "loading" || load.state === "loading") return <p className="text-muted">{t(locale, "cart.loading")}</p>;
  if (load.state === "error") return <p role="alert" className="text-danger">{t(locale, "cart.loadError")}</p>;

  const cart = load.cart;
  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-muted">{t(locale, "cart.empty")}</p>
        <Button href="/coffees" variant="secondary">
          {t(locale, "cart.browse")}
        </Button>
      </div>
    );
  }

  async function write(line: string, run: () => Promise<CartData>) {
    setBusy(line);
    setProblem(null);
    try {
      setLoad({ state: "ready", cart: await run() });
    } catch (err) {
      const e = toApiError(err);
      setProblem({ line, p: e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : { key: cartErrorKey(e.code, e.field) } });
    } finally {
      setBusy(null);
    }
  }
  const setQty = (l: CartLine, quantity: number) =>
    write(l.id, async () => (await request(UPDATE_CART_ITEM, { id: l.id, quantity })).updateCartItem);
  const remove = (l: CartLine) => write(l.id, async () => (await request(REMOVE_FROM_CART, { id: l.id })).removeFromCart);

  return (
    <div className="space-y-6">
      {groupByShop(cart.items).map((g) => (
        <Card as="section" key={g.shop?.slug ?? "gone"} className="p-4 sm:p-6" aria-label={g.shop?.name ?? t(locale, "cart.gone")}>
          <SectionTitle>
            {g.shop ? (
              <Link href={`/shops/${g.shop.slug}`} className="underline-offset-4 hover:underline">
                {g.shop.name}
              </Link>
            ) : (
              t(locale, "cart.gone")
            )}
          </SectionTitle>
          <ul className="mt-3 divide-y divide-line">
            {g.lines.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <p className="font-semibold text-ink">
                      {l.coffee ? (
                        <Link href={`/coffees/${l.coffee.id}`} className="underline-offset-4 hover:underline">
                          {l.coffee.name}
                        </Link>
                      ) : (
                        t(locale, "cart.goneLine")
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {t(locale, `grind.${l.variant.grind}` as MessageKey)} · {l.variant.weightG} g · NT${formatTWD(l.priceTwd)}
                    </p>
                    {l.priceChanged && (
                      <p className="text-xs text-ink">{t(locale, "cart.priceChanged", { old: formatTWD(l.addedPriceTwd) })}</p>
                    )}
                    {!l.available && <p className="text-xs text-danger">{t(locale, "cart.unavailable")}</p>}
                  </div>
                  <label className="block w-20 text-xs font-medium text-muted">
                    {t(locale, "cart.quantity")}
                    <Select
                      value={l.quantity}
                      disabled={busy !== null}
                      onChange={(e) => void setQty(l, Number(e.target.value))}
                      className="mt-1"
                    >
                      {quantityChoices(l.variant.stock, 0, l.quantity).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className={`ml-auto w-24 text-right font-semibold ${l.available ? "text-ink" : "text-muted line-through"}`}>
                    NT${formatTWD(l.lineTotalTwd)}
                  </p>
                  <Button size="sm" variant="secondary" pending={busy === l.id} disabled={busy !== null} onClick={() => void remove(l)}>
                    {t(locale, "cart.remove")}
                  </Button>
                </div>
                {problem?.line === l.id && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {t(locale, problem.p.key, problem.p.vars)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {g.shop && (
            <p className="mt-3 flex justify-between border-t border-line pt-3 text-sm text-ink">
              <span>{t(locale, "cart.shopSubtotal", { shop: g.shop.name })}</span>
              <span className="font-semibold">NT${formatTWD(g.subtotalTwd)}</span>
            </p>
          )}
        </Card>
      ))}
      <div className="flex items-baseline justify-between border-t border-ink pt-4">
        <span className="text-lg font-bold text-ink">
          {t(locale, "cart.total")} <span className="text-sm font-normal text-muted">{t(locale, "cart.itemCount", { n: cart.itemCount })}</span>
        </span>
        <span className="text-lg font-bold text-ink">NT${formatTWD(cart.subtotalTwd)}</span>
      </div>
      <p className="rounded-box bg-paper px-4 py-3 text-sm text-muted">{t(locale, "cart.checkoutSoon")}</p>
    </div>
  );
}
