"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MY_SAVED_COFFEES, UNSAVE_COFFEE, fromPrice, type CoffeeCardData } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { SAVED_PAGE, appendSaved, hasMoreSaved, withoutSaved } from "@/lib/saved";
import { formatTWD } from "@/lib/utils";

type List = { total: number; nodes: CoffeeCardData[] };
type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; list: List; lastPage: number; more: "idle" | "loading" | "error" };

/** /account "我的收藏 / Saved coffees": the viewer's saved coffees, newest saved first, each removable. */
export function SavedCoffees({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [s, setS] = useState<State>({ state: "loading" });
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState(false);

  const fetchPage = useCallback(
    async (offset: number): Promise<List> => {
      const r = await request(MY_SAVED_COFFEES, { limit: SAVED_PAGE, offset });
      if (!r.me) throw new Error("signed out");
      return r.me.savedCoffees;
    },
    [request],
  );

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (list) => live && setS({ state: "ready", list, lastPage: list.nodes.length, more: "idle" }),
      () => live && setS({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (s.state !== "ready") return;
    const shown = s.list;
    setS({ ...s, more: "loading" });
    try {
      const next = await fetchPage(shown.nodes.length);
      setS({
        state: "ready",
        list: { total: next.total, nodes: appendSaved(shown.nodes, next.nodes) },
        lastPage: next.nodes.length,
        more: "idle",
      });
    } catch {
      setS({ ...s, more: "error" });
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setRemoveError(false);
    try {
      await request(UNSAVE_COFFEE, { id });
      setS((cur) => (cur.state === "ready" ? { ...cur, list: withoutSaved(cur.list, id) } : cur));
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-labelledby="saved-coffees">
      <h2 id="saved-coffees" className="text-xl font-bold text-stone-900">
        {t(locale, "account.savedCoffees")}
        {s.state === "ready" && s.list.total > 0 && (
          <span className="ml-2 text-sm font-normal text-stone-500">
            {t(locale, "coffees.count", { n: s.list.total })}
          </span>
        )}
      </h2>

      {s.state === "loading" && <p className="mt-4 text-sm text-stone-500">{t(locale, "dash.loading")}</p>}
      {s.state === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {t(locale, "dash.error.generic")}
        </p>
      )}
      {s.state === "ready" && s.list.nodes.length === 0 && (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "account.noSaved")}{" "}
          <Link href="/coffees" className="font-semibold text-amber-700 hover:underline">
            {t(locale, "account.browseCoffees")}
          </Link>
        </p>
      )}
      {removeError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {t(locale, "save.error")}
        </p>
      )}
      {s.state === "ready" && s.list.nodes.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
          {s.list.nodes.map((c) => {
            const price = fromPrice(c);
            const img = c.imageUrls[0];
            return (
              <li key={c.id} className="flex items-center gap-4 p-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-amber-50">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span aria-hidden className="text-2xl">
                      ☕
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/coffees/${encodeURIComponent(c.id)}`} className="font-semibold text-stone-900 hover:text-amber-700">
                    {c.name}
                  </Link>
                  <p className="truncate text-sm text-stone-500">
                    {c.shop.name} · {pick(locale, c.originCountry.nameZh, c.originCountry.nameEn)}
                  </p>
                  <p className="text-sm text-stone-700">
                    {price === null ? t(locale, "coffees.soldOut") : t(locale, "coffees.from", { price: formatTWD(price) })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={removing !== null}
                  aria-label={t(locale, "account.unsaveNamed", { name: c.name })}
                  className="shrink-0 rounded-full px-3 py-1 text-sm text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
                >
                  {removing === c.id ? t(locale, "account.removing") : t(locale, "account.unsave")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {s.state === "ready" && hasMoreSaved(s.list.nodes.length, s.list.total, s.lastPage) && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={s.more === "loading"}
            className="rounded-full px-5 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
          >
            {s.more === "loading" ? t(locale, "dash.loading") : t(locale, "account.moreSaved")}
          </button>
          {s.more === "error" && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t(locale, "dash.error.generic")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
