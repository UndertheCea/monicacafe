"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MY_SAVED_COFFEES, UNSAVE_COFFEE, fromPrice, type CoffeeCardData } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { SAVED_PAGE, appendSaved, hasMoreSaved, withoutSaved } from "@/lib/saved";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "@/components/coffees/CoffeeTile";
import { Button, Card, Picture, SectionTitle } from "@/components/ui";

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
      <SectionTitle id="saved-coffees">
        {t(locale, "account.savedCoffees")}
        {s.state === "ready" && s.list.total > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">
            {t(locale, "coffees.count", { n: s.list.total })}
          </span>
        )}
      </SectionTitle>

      {s.state === "loading" && <p className="mt-4 text-sm text-muted">{t(locale, "dash.loading")}</p>}
      {s.state === "error" && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {t(locale, "dash.error.generic")}
        </p>
      )}
      {s.state === "ready" && s.list.nodes.length === 0 && (
        <Card as="p" className="mt-4 p-6 text-center text-muted">
          {t(locale, "account.noSaved")}{" "}
          <Link href="/coffees" className="font-semibold text-ink underline-offset-4 hover:underline">
            {t(locale, "account.browseCoffees")}
          </Link>
        </Card>
      )}
      {removeError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {t(locale, "save.error")}
        </p>
      )}
      {s.state === "ready" && s.list.nodes.length > 0 && (
        <Card as="ul" className="mt-4 divide-y divide-line">
          {s.list.nodes.map((c) => {
            const price = fromPrice(c);
            const img = c.imageUrls[0];
            return (
              <li key={c.id} className="flex items-center gap-4 p-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-box bg-white">
                  {img ? (
                    <Picture src={img} thumb width={56} height={56} alt="" />
                  ) : (
                    <CoffeeTile size="thumb" id={c.id} name={c.name} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/coffees/${encodeURIComponent(c.id)}`} className="font-semibold text-ink hover:text-ink hover:underline underline-offset-4">
                    {c.name}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {c.shop.name} · {pick(locale, c.originCountry.nameZh, c.originCountry.nameEn)}
                  </p>
                  <p className="text-sm text-ink">
                    {price === null ? t(locale, "coffees.soldOut") : t(locale, "coffees.from", { price: formatTWD(price) })}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={removing !== null}
                  aria-label={t(locale, "account.unsaveNamed", { name: c.name })}
                  variant="secondary" size="sm" className="shrink-0"
                >
                  {removing === c.id ? t(locale, "account.removing") : t(locale, "account.unsave")}
                </Button>
              </li>
            );
          })}
        </Card>
      )}
      {s.state === "ready" && hasMoreSaved(s.list.nodes.length, s.list.total, s.lastPage) && (
        <div className="mt-4 text-center">
          <Button
            type="button"
            onClick={loadMore}
            disabled={s.more === "loading"}
            variant="secondary"
          >
            {s.more === "loading" ? t(locale, "dash.loading") : t(locale, "account.moreSaved")}
          </Button>
          {s.more === "error" && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t(locale, "dash.error.generic")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
