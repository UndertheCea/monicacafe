"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { bagCountKey, cartLineName, cartProblem, groupByShop, lineQuantityChoices, orphanProblem, shouldReloadCart, type CartData, type CartLine, type CartProblem } from "@/lib/cart";
import { ACCEPT_CART_PRICE, CART, REMOVE_FROM_CART, UPDATE_CART_ITEM } from "@/lib/cartQueries";
import { setCartSnapshot } from "@/lib/cartStore";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { Button, Card, Select, SectionTitle } from "@/components/ui";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; cart: CartData };
type Problem = CartProblem;

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
      (r) => {
        if (!live) return;
        setLoad({ state: "ready", cart: r.cart });
        setCartSnapshot(r.cart);
      },
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
  const orphan = orphanProblem(problem, cart.items);
  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        {orphan && (
          <p role="alert" className="text-sm text-danger">
            {t(locale, orphan.key, orphan.vars)}
          </p>
        )}
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
      const next = await run();
      setLoad({ state: "ready", cart: next });
      setCartSnapshot(next);
    } catch (err) {
      const e = toApiError(err);
      setProblem({ line, p: e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : cartProblem(e.code, e.field, e.available) });
      if (shouldReloadCart(e.code)) {
        // The line changed or went away on the server: show what it holds now, keeping the message.
        try {
          const fresh = (await request(CART, {})).cart;
          setLoad({ state: "ready", cart: fresh });
          setCartSnapshot(fresh);
        } catch {
          // Keep the page as it is; the next change or reload fetches again.
        }
      }
    } finally {
      setBusy(null);
    }
  }
  const setQty = (l: CartLine, quantity: number) =>
    write(l.id, async () => (await request(UPDATE_CART_ITEM, { id: l.id, quantity })).updateCartItem);
  const acceptPrice = (l: CartLine) =>
    write(l.id, async () => (await request(ACCEPT_CART_PRICE, { id: l.id, expectedPriceTwd: l.priceTwd })).acceptCartPrice);
  const remove = (l: CartLine) => write(l.id, async () => (await request(REMOVE_FROM_CART, { id: l.id })).removeFromCart);

  return (
    <div className="space-y-6">
      {orphan && (
        <p role="alert" className="text-sm text-danger">
          {t(locale, orphan.key, orphan.vars)}
        </p>
      )}
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
            {g.lines.map((l) => {
              const name = cartLineName(l, t(locale, `grind.${l.variant.grind}` as MessageKey));
              return (
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
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink">
                        <span>
                          {t(locale, "cart.priceChanged", { old: formatTWD(l.addedPriceTwd), new: formatTWD(l.priceTwd) })}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t(locale, "cart.acceptPriceFor", { name })}
                          disabled={busy !== null}
                          onClick={() => void acceptPrice(l)}
                        >
                          {t(locale, "cart.acceptPrice")}
                        </Button>
                      </p>
                    )}
                    {!l.available && <p className="text-xs text-danger">{t(locale, "cart.unavailable")}</p>}
                  </div>
                  <label className="block w-20 text-xs font-medium text-muted">
                    {t(locale, "cart.quantity")}
                    <Select
                      value={l.quantity}
                      aria-label={t(locale, "cart.quantityFor", { name })}
                      disabled={busy !== null}
                      onChange={(e) => void setQty(l, Number(e.target.value))}
                      className="mt-1"
                    >
                      {lineQuantityChoices(l).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className={`ml-auto w-24 text-right font-semibold ${l.available ? "text-ink" : "text-muted line-through"}`}>
                    NT${formatTWD(l.lineTotalTwd)}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t(locale, "cart.removeNamed", { name })}
                    pending={busy === l.id}
                    disabled={busy !== null}
                    onClick={() => void remove(l)}
                  >
                    {t(locale, "cart.remove")}
                  </Button>
                </div>
                {problem?.line === l.id && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {t(locale, problem.p.key, problem.p.vars)}
                  </p>
                )}
              </li>
              );
            })}
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
          {t(locale, "cart.total")} <span className="text-sm font-normal text-muted">{t(locale, bagCountKey("cart.itemCount", cart.itemCount), { n: cart.itemCount })}</span>
        </span>
        <span className="text-lg font-bold text-ink">NT${formatTWD(cart.subtotalTwd)}</span>
      </div>
      <p className="rounded-box bg-paper px-4 py-3 text-sm text-muted">{t(locale, "cart.checkoutSoon")}</p>
    </div>
  );
}
