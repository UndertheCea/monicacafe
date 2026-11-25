"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { bagCountKey, cartLineName, cartProblem, groupByShop, lineQuantityChoices, orphanProblem, shouldReloadCart, type CartData, type CartLine, type CartProblem } from "@/lib/cart";
import { chosenQuantity, focusTargetAfterRemove, quantityChanged } from "@/lib/cartUi";
import { ACCEPT_CART_PRICE, CART, REMOVE_FROM_CART, UPDATE_CART_ITEM } from "@/lib/cartQueries";
import { setCartSnapshot } from "@/lib/cartStore";
import { rateLimitMessage } from "@/lib/errors";
import { nextLoadKey } from "@/lib/retry";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { Button, Card, Select, SectionTitle } from "@/components/ui";
import { RetryButton } from "@/components/RetryButton";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; cart: CartData };
type Problem = CartProblem;

/** /cart (#280): lines grouped by shop with quantity, remove and totals. Checkout comes later. */
export function CartView({ locale }: { locale: Locale }) {
  const { status, request } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" (#437)
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ line: string; p: Problem } | null>(null);
  // Unsaved quantity choices per line; saved with "Update", once (#374).
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  // Where focus goes once the cart re-renders after a remove (#374).
  const focusAfter = useRef<ReturnType<typeof focusTargetAfterRemove> | null>(null);

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
  }, [status, request, attempt]);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target || busy !== null) return;
    focusAfter.current = null;
    const el =
      target.kind === "line"
        ? document.querySelector<HTMLElement>(`[data-line-focus="${CSS.escape(target.id)}"]`)
        : document.getElementById("cart-heading");
    el?.focus();
  }, [load, busy]);

  if (status === "anonymous") {
    return (
      <p>
        <Button href="/login?next=%2Fcart">{t(locale, "cart.loginToBuy")}</Button>
      </p>
    );
  }
  if (status === "loading" || load.state === "loading") return <p className="text-muted">{t(locale, "cart.loading")}</p>;
  if (load.state === "error") {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-danger">{t(locale, "cart.loadError")}</p>
        <RetryButton
          locale={locale}
          onRetry={() => {
            setLoad({ state: "loading" });
            setAttempt(nextLoadKey);
          }}
        />
      </div>
    );
  }

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
    if (busy !== null) return; // aria-disabled controls stay focusable, so guard here (#374)
    setBusy(line);
    setProblem(null);
    try {
      const next = await run();
      setLoad({ state: "ready", cart: next });
      setCartSnapshot(next);
    } catch (err) {
      const e = toApiError(err);
      setProblem({ line, p: e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : cartProblem(e.code, e.field, e.available, "set") });
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
    write(l.id, async () => {
      const next = (await request(UPDATE_CART_ITEM, { id: l.id, quantity })).updateCartItem;
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => id !== l.id)));
      return next;
    });
  const acceptPrice = (l: CartLine) =>
    write(l.id, async () => (await request(ACCEPT_CART_PRICE, { id: l.id, expectedPriceTwd: l.priceTwd })).acceptCartPrice);
  const remove = (l: CartLine) => {
    if (busy !== null) return;
    const shown = groupByShop(cart.items).flatMap((g) => g.lines.map((x) => x.id));
    return write(l.id, async () => {
      const next = (await request(REMOVE_FROM_CART, { id: l.id })).removeFromCart;
      focusAfter.current = focusTargetAfterRemove(shown, l.id); // only once the line is really gone
      return next;
    });
  };

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
              const choices = lineQuantityChoices(l);
              const changed = quantityChanged(l.quantity, drafts[l.id], choices);
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
                          aria-disabled={busy !== null}
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
                      value={chosenQuantity(l.quantity, drafts[l.id], choices)}
                      aria-label={t(locale, "cart.quantityFor", { name })}
                      aria-disabled={busy !== null}
                      data-line-focus={l.id}
                      onChange={(e) => {
                        if (busy !== null) return;
                        setDrafts((d) => ({ ...d, [l.id]: Number(e.target.value) }));
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
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t(locale, "cart.updateFor", { name })}
                    aria-disabled={busy !== null || !changed}
                    className={busy !== null || !changed ? "opacity-50" : undefined}
                    onClick={() => {
                      const q = drafts[l.id];
                      if (busy === null && changed && q !== undefined) void setQty(l, q);
                    }}
                  >
                    {t(locale, "cart.update")}
                  </Button>
                  <p className={`ml-auto w-24 text-right font-semibold ${l.available ? "text-ink" : "text-muted line-through"}`}>
                    NT${formatTWD(l.lineTotalTwd)}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t(locale, "cart.removeNamed", { name })}
                    aria-busy={busy === l.id || undefined}
                    aria-disabled={busy !== null}
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
