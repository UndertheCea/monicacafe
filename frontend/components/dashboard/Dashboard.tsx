"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fromPrice } from "@/lib/api";
import { appendCoffeePage, hasMoreCoffees, withPublished } from "@/lib/dashboard/coffeePages";
import { MY_SHOP, MY_SHOP_COFFEES, PUBLISH_COFFEE, UNPUBLISH_COFFEE, type DashboardShop } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { withoutCoffee } from "@/lib/dashboard/deleteCoffee";
import { CreateShopForm } from "./CreateShopForm";
import { DeleteCoffeeButton } from "./DeleteCoffeeButton";
import { DuplicateCoffeeButton } from "./DuplicateCoffeeButton";
import { FormError, LoginNeeded, Notice } from "./ui";

// lastPage: size of the last coffee page fetched (a short one means the end).
type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; shop: DashboardShop | null; lastPage: number };

export function Dashboard({ locale }: { locale: Locale }) {
  const { status, request } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [rowError, setRowError] = useState<{ id: string; key: MessageKey } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");

  const loadShop = useCallback(async (): Promise<Load> => {
    try {
      const r = await request(MY_SHOP);
      const shop = r.me?.shop ?? null;
      return { state: "ready", shop, lastPage: shop?.coffees.nodes.length ?? 0 };
    } catch {
      return { state: "error" };
    }
  }, [request]);
  const fetchShop = useCallback(() => loadShop().then(setLoad), [loadShop]);

  // Fetch on sign-in; setState happens in the promise callback, and a stale
  // response (status changed meanwhile) is dropped.
  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    void loadShop().then((l) => live && setLoad(l));
    return () => {
      live = false;
    };
  }, [status, loadShop]);

  if (status === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (status === "anonymous") return <LoginNeeded locale={locale} next="/dashboard" />;
  if (load.state === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (load.state === "error") return <Notice>{t(locale, "error.title")}</Notice>;
  if (!load.shop) return <CreateShopForm locale={locale} onCreated={() => void fetchShop()} />;

  const shop = load.shop;
  const lastPage = load.lastPage;
  const setCoffees = (coffees: DashboardShop["coffees"], last = lastPage) =>
    setLoad({ state: "ready", shop: { ...shop, coffees }, lastPage: last });

  async function toggle(id: string, publish: boolean) {
    setPending(id);
    setRowError(null);
    try {
      // Update the row in place: a refetch would drop rows loaded with "load more".
      const isPublished = publish
        ? (await request(PUBLISH_COFFEE, { id })).publishCoffee.isPublished
        : (await request(UNPUBLISH_COFFEE, { id })).unpublishCoffee.isPublished;
      setCoffees(withPublished(shop.coffees, id, isPublished));
    } catch (err) {
      const e = toApiError(err);
      setRowError({
        id,
        key: e.code === "BAD_USER_INPUT" && publish ? "dash.error.publishNeedsVariant" : "dash.error.generic",
      });
    } finally {
      setPending(null);
    }
  }

  async function loadMore() {
    setMore("loading");
    try {
      const r = await request(MY_SHOP_COFFEES, { offset: shop.coffees.nodes.length });
      const page = r.me?.shop?.coffees;
      if (!page) throw new Error("shop gone");
      setCoffees(appendCoffeePage(shop.coffees, page), page.nodes.length);
      setMore("idle");
    } catch {
      setMore("error");
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-stone-900">{shop.name}</h2>
          <p className="text-sm text-stone-500">
            {shop.city} · <span className="font-mono">/shops/{shop.slug}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/shop"
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          >
            {t(locale, "dash.editShop")}
          </Link>
          <Link
            href={`/shops/${shop.slug}`}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:border-stone-500"
          >
            {t(locale, "dash.viewShop")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="my-coffees">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="my-coffees" className="text-xl font-bold text-stone-900">
            {t(locale, "dash.coffees")}{" "}
            <span className="text-sm font-normal text-stone-500">
              {t(locale, "dash.coffeesCount", { n: shop.coffees.total })}
            </span>
          </h2>
          <Link
            href="/dashboard/coffees/new"
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400"
          >
            {t(locale, "dash.newCoffee")}
          </Link>
        </div>

        {shop.coffees.nodes.length === 0 ? (
          <div className="mt-4">
            <Notice>{t(locale, "dash.noCoffees")}</Notice>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {shop.coffees.nodes.map((c) => {
              const price = fromPrice(c);
              return (
                <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          c.isPublished
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                            : "rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200"
                        }
                      >
                        {t(locale, c.isPublished ? "dash.published" : "dash.draft")}
                      </span>
                      <span className="truncate font-semibold text-stone-900">{c.name}</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {c.variants.length === 0
                        ? t(locale, "dash.noVariants")
                        : t(locale, "dash.variantsCount", { n: c.variants.length })}
                      {price !== null && ` · ${t(locale, "dash.from", { price: formatTWD(price) })}`}
                      {` · ${t(locale, "coffees.comments", { n: c.commentCount })}`}
                    </p>
                    {rowError?.id === c.id && (
                      <div className="mt-2">
                        <FormError>{t(locale, rowError.key)}</FormError>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {c.isPublished && (
                      <Link href={`/coffees/${c.id}`} className="rounded-full px-3 py-1.5 text-sm text-stone-600 hover:text-amber-700">
                        {t(locale, "dash.view")}
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/coffees/${c.id}/preview`}
                      className="rounded-full px-3 py-1.5 text-sm text-stone-600 hover:text-amber-700"
                    >
                      {t(locale, "dash.preview")}
                    </Link>
                    <Link
                      href={`/dashboard/coffees/${c.id}`}
                      className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:border-stone-500"
                    >
                      {t(locale, "dash.edit")}
                    </Link>
                    <button
                      type="button"
                      disabled={pending === c.id}
                      onClick={() => void toggle(c.id, !c.isPublished)}
                      className={
                        c.isPublished
                          ? "rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                          : "rounded-full bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
                      }
                    >
                      {t(locale, c.isPublished ? "dash.unpublish" : "dash.publish")}
                    </button>
                    <DuplicateCoffeeButton coffeeId={c.id} name={c.name} locale={locale} />
                    {!c.isPublished && (
                      <DeleteCoffeeButton
                        coffeeId={c.id}
                        locale={locale}
                        onDeleted={() => setCoffees(withoutCoffee(shop.coffees, c.id))}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMoreCoffees(shop.coffees.nodes.length, shop.coffees.total, lastPage) && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {more === "error" && <FormError>{t(locale, "dash.error.generic")}</FormError>}
            <button
              type="button"
              disabled={more === "loading"}
              onClick={() => void loadMore()}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:border-stone-500 disabled:opacity-50"
            >
              {t(locale, more === "loading" ? "dash.loading" : "dash.moreCoffees", {
                n: shop.coffees.total - shop.coffees.nodes.length,
              })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
