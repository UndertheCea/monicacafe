"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fromPrice } from "@/lib/api";
import { appendCoffeePage, canReorder, hasMoreCoffees, moveItem, withPublished } from "@/lib/dashboard/coffeePages";
import { COMMENT_LIST_PAGE } from "@/lib/comments";
import {
  MY_SHOP,
  MY_SHOP_COFFEES,
  MY_SHOP_COMMENTS,
  PUBLISH_COFFEE,
  REORDER_SHOP_COFFEES,
  UNPUBLISH_COFFEE,
  type DashboardShop,
} from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "@/components/coffees/CoffeeTile";
import { withoutCoffee } from "@/lib/dashboard/deleteCoffee";
import { stockStatus } from "@/lib/dashboard/stockStatus";
import { CommentFeed } from "@/components/CommentFeed";
import { CreateShopForm } from "./CreateShopForm";
import { DeleteCoffeeButton } from "./DeleteCoffeeButton";
import { DuplicateCoffeeButton } from "./DuplicateCoffeeButton";
import { FormError, LoginNeeded, Notice } from "./ui";
import { engagementParts, followerPart } from "@/lib/dashboard/engagement";

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
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState(false);

  const fetchComments = useCallback(
    async (offset: number) => {
      const r = await request(MY_SHOP_COMMENTS, { limit: COMMENT_LIST_PAGE, offset });
      const page = r.me?.shop?.recentComments;
      if (!page) throw new Error("shop gone");
      return page;
    },
    [request],
  );

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

  // Optimistic: the row moves at once; the whole lineup is saved and the old
  // order comes back if the request fails (#162).
  async function move(index: number, delta: number) {
    const before = shop.coffees;
    const nodes = moveItem(before.nodes, index, delta);
    if (nodes === before.nodes) return;
    setOrdering(true);
    setOrderError(false);
    setCoffees({ ...before, nodes: [...nodes] });
    try {
      await request(REORDER_SHOP_COFFEES, { shopId: shop.id, coffeeIds: nodes.map((c) => c.id) });
    } catch {
      setCoffees(before);
      setOrderError(true);
    } finally {
      setOrdering(false);
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

  const followers = followerPart(shop.followerCount);
  const reorderable = canReorder(shop.coffees.nodes.length, shop.coffees.total);
  const lastIndex = shop.coffees.nodes.length - 1;
  const moveBtn =
    "flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-sm text-ink hover:border-neutral-500 disabled:opacity-30 disabled:hover:border-neutral-300";
  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-ink">{shop.name}</h2>
          <p className="text-sm text-neutral-500">
            {shop.city} · <span className="font-mono">/shops/{shop.slug}</span> ·{" "}
            {t(locale, followers.key, { n: followers.n })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/shop"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            {t(locale, "dash.editShop")}
          </Link>
          <Link
            href={`/shops/${shop.slug}`}
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500"
          >
            {t(locale, "dash.viewShop")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="my-coffees">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="my-coffees" className="text-xl font-bold text-ink">
            {t(locale, "dash.coffees")}{" "}
            <span className="text-sm font-normal text-neutral-500">
              {t(locale, "dash.coffeesCount", { n: shop.coffees.total })}
            </span>
          </h2>
          <Link
            href="/dashboard/coffees/new"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            {t(locale, "dash.newCoffee")}
          </Link>
        </div>

        {shop.coffees.total > 1 && (
          <p className="mt-2 text-sm text-neutral-500">
            {t(locale, "dash.orderNote")}
            {!reorderable && ` ${t(locale, "dash.orderLoadAll")}`}
          </p>
        )}
        {orderError && (
          <div className="mt-2" role="alert">
            <FormError>{t(locale, "dash.error.reorder")}</FormError>
          </div>
        )}

        {shop.coffees.nodes.length === 0 ? (
          <div className="mt-4">
            <Notice>{t(locale, "dash.noCoffees")}</Notice>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100 rounded-2xl bg-white ring-1 ring-neutral-200">
            {shop.coffees.nodes.map((c, i) => {
              const price = fromPrice(c);
              return (
                <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  {reorderable && (
                    <div className="flex shrink-0 gap-1 sm:flex-col">
                      <button
                        type="button"
                        className={moveBtn}
                        disabled={ordering || i === 0}
                        onClick={() => void move(i, -1)}
                        aria-label={t(locale, "dash.moveUp", { name: c.name })}
                        title={t(locale, "dash.moveUp", { name: c.name })}
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        className={moveBtn}
                        disabled={ordering || i === lastIndex}
                        onClick={() => void move(i, 1)}
                        aria-label={t(locale, "dash.moveDown", { name: c.name })}
                        title={t(locale, "dash.moveDown", { name: c.name })}
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                    </div>
                  )}
                  <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-neutral-200 sm:block">
                    {c.imageUrls[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <CoffeeTile size="thumb" id={c.id} name={c.name} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          c.isPublished
                            ? "rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-ink"
                            : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200"
                        }
                      >
                        {t(locale, c.isPublished ? "dash.published" : "dash.draft")}
                      </span>
                      <StockBadge locale={locale} variants={c.variants} />
                      <span className="truncate font-semibold text-ink">{c.name}</span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {c.variants.length === 0
                        ? t(locale, "dash.noVariants")
                        : t(locale, "dash.variantsCount", { n: c.variants.length })}
                      {price !== null && ` · ${t(locale, "dash.from", { price: formatTWD(price) })}`}
                      {engagementParts(c)
                        .map((p) => ` · ${t(locale, p.key, { n: p.n })}`)
                        .join("")}
                    </p>
                    {rowError?.id === c.id && (
                      <div className="mt-2">
                        <FormError>{t(locale, rowError.key)}</FormError>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {c.isPublished && (
                      <Link href={`/coffees/${c.id}`} className="rounded-full px-3 py-1.5 text-sm text-neutral-600 hover:text-ink hover:underline underline-offset-4">
                        {t(locale, "dash.view")}
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/coffees/${c.id}/preview`}
                      className="rounded-full px-3 py-1.5 text-sm text-neutral-600 hover:text-ink hover:underline underline-offset-4"
                    >
                      {t(locale, "dash.preview")}
                    </Link>
                    <Link
                      href={`/dashboard/coffees/${c.id}`}
                      className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-500"
                    >
                      {t(locale, "dash.edit")}
                    </Link>
                    <button
                      type="button"
                      disabled={pending === c.id}
                      onClick={() => void toggle(c.id, !c.isPublished)}
                      className={
                        c.isPublished
                          ? "rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                          : "rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
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
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
            >
              {t(locale, more === "loading" ? "dash.loading" : "dash.moreCoffees", {
                n: shop.coffees.total - shop.coffees.nodes.length,
              })}
            </button>
          </div>
        )}
      </section>

      <CommentFeed
        locale={locale}
        id="recent-comments"
        title="dash.recentComments"
        empty="dash.noRecentComments"
        showAuthor
        fetchPage={fetchComments}
      />
    </div>
  );
}

/** "Sold out" / "Low stock (n)" next to a coffee that needs restocking. */
function StockBadge({ locale, variants }: { locale: Locale; variants: DashboardShop["coffees"]["nodes"][number]["variants"] }) {
  const s = stockStatus(variants);
  if (s.kind === "out") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
        {t(locale, "dash.stockOut")}
      </span>
    );
  }
  if (s.kind === "low") {
    return (
      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-neutral-300">
        {t(locale, "dash.stockLow", { n: s.units })}
      </span>
    );
  }
  return null;
}
