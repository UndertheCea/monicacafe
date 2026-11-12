"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MY_FOLLOWED_SHOPS, UNFOLLOW_SHOP, type ShopSummary } from "@/lib/api";
import { FOLLOWED_PAGE } from "@/lib/follows";
import { t, type Locale } from "@/lib/i18n/dict";
import { appendSaved, hasMoreSaved, withoutSaved } from "@/lib/saved";
import { ShopLogo } from "@/components/shops/ShopLogo";
import { Button, Card, SectionTitle } from "@/components/ui";

type List = { total: number; nodes: ShopSummary[] };
type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; list: List; lastPage: number; more: "idle" | "loading" | "error" };

/** /account "追蹤的店家 / Shops you follow": most recently followed first, each can be unfollowed. */
export function FollowedShops({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [s, setS] = useState<State>({ state: "loading" });
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState(false);

  const fetchPage = useCallback(
    async (offset: number): Promise<List> => {
      const r = await request(MY_FOLLOWED_SHOPS, { limit: FOLLOWED_PAGE, offset });
      if (!r.me) throw new Error("signed out");
      return r.me.followedShops;
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

  async function unfollow(id: string) {
    setRemoving(id);
    setRemoveError(false);
    try {
      await request(UNFOLLOW_SHOP, { id });
      setS((cur) => (cur.state === "ready" ? { ...cur, list: withoutSaved(cur.list, id) } : cur));
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-labelledby="followed-shops">
      <SectionTitle id="followed-shops">
        {t(locale, "account.followedShops")}
        {s.state === "ready" && s.list.total > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">{t(locale, "shops.count", { n: s.list.total })}</span>
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
          {t(locale, "account.noFollowed")}{" "}
          <Link href="/shops" className="font-semibold text-ink underline-offset-4 hover:underline">
            {t(locale, "account.browseShops")}
          </Link>
        </Card>
      )}
      {removeError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {t(locale, "follow.error")}
        </p>
      )}
      {s.state === "ready" && s.list.nodes.length > 0 && (
        <Card as="ul" className="mt-4 divide-y divide-line">
          {s.list.nodes.map((sh) => (
            <li key={sh.id} className="flex items-center gap-4 p-4">
              <ShopLogo name={sh.name} logoUrl={sh.logoUrl} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/shops/${encodeURIComponent(sh.slug)}`} className="font-semibold text-ink hover:text-ink hover:underline underline-offset-4">
                  {sh.name}
                </Link>
                <p className="truncate text-sm text-muted">
                  {[sh.city, t(locale, "shops.coffeesCount", { n: sh.coffeeCount })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => unfollow(sh.id)}
                disabled={removing !== null}
                aria-label={t(locale, "account.unfollowNamed", { name: sh.name })}
                variant="secondary" size="sm" className="shrink-0"
              >
                {removing === sh.id ? t(locale, "account.removing") : t(locale, "account.unfollow")}
              </Button>
            </li>
          ))}
        </Card>
      )}
      {s.state === "ready" && hasMoreSaved(s.list.nodes.length, s.list.total, s.lastPage, FOLLOWED_PAGE) && (
        <div className="mt-4 text-center">
          <Button
            type="button"
            onClick={loadMore}
            disabled={s.more === "loading"}
            variant="secondary"
          >
            {s.more === "loading" ? t(locale, "dash.loading") : t(locale, "account.moreFollowed")}
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
