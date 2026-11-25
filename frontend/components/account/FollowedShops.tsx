"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLoadMore } from "@/components/useLoadMore";
import { focusAfterRemoval, focusLoadedRow } from "@/components/focusAfterRemoval";
import { emptiedWithMore, firstNewRow } from "@/lib/loadMore";
import { MY_FOLLOWED_SHOPS, UNFOLLOW_SHOP, type ShopSummary } from "@/lib/api";
import { FOLLOWED_PAGE } from "@/lib/follows";
import { t, type Locale } from "@/lib/i18n/dict";
import { hasMoreSaved, withoutSaved } from "@/lib/saved";
import { ShopLogo } from "@/components/shops/ShopLogo";
import { Button, Card, SectionTitle } from "@/components/ui";
import { pluralKey } from "@/lib/plural";
import { nextLoadKey } from "@/lib/retry";

type List = { total: number; nodes: ShopSummary[] };
type State =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; list: List; lastPage: number; more: "idle" | "loading" | "error" };

/** /account "追蹤的店家 / Shops you follow": most recently followed first, each can be unfollowed. */
export function FollowedShops({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [s, setS] = useState<State>({ state: "loading" });
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" (#437)
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

  const more = useLoadMore(fetchPage);

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (list) => live && setS({ state: "ready", list, lastPage: list.nodes.length, more: "idle" }),
      () => live && setS({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage, attempt]);

  /** `shownNow`: the rows left after a removal, when it is called before that render. */
  async function loadMore(shownNow?: number) {
    if (s.state !== "ready") return;
    const shown = shownNow ?? s.list.nodes.length;
    setS((cur) => (cur.state === "ready" ? { ...cur, more: "loading" } : cur));
    try {
      const next = await more.fetchMore(shown);
      // Merge into the list as it is now: rows removed meanwhile stay gone (#338).
      setS((cur) =>
        cur.state === "ready"
          ? { ...cur, list: more.merge(cur.list, next), lastPage: next.nodes.length, more: "idle" }
          : cur,
      );
      // The last page removes the button: focus goes to the first row it added (#510).
      focusLoadedRow(firstNewRow(s.list.nodes, next.nodes));
    } catch {
      setS((cur) => (cur.state === "ready" ? { ...cur, more: "error" } : cur));
    }
  }

  async function unfollow(id: string, row: Element | null) {
    setRemoving(id);
    setRemoveError(false);
    try {
      await request(UNFOLLOW_SHOP, { id });
      focusAfterRemoval(row); // keep the visitor's place (#405)
      more.removed(id);
      setS((cur) => (cur.state === "ready" ? { ...cur, list: withoutSaved(cur.list, id) } : cur));
      if (s.state === "ready" && s.more === "idle") {
        const left = withoutSaved(s.list, id);
        if (emptiedWithMore(left.nodes.length, left.total, s.lastPage, FOLLOWED_PAGE)) void loadMore(0);
      }
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(null);
    }
  }

  // Removals emptied the rows on screen but more are left: the removal fetches
  // them (below "load more" shows its progress or error), so no empty state (#404).
  const refilling =
    s.state === "ready" && emptiedWithMore(s.list.nodes.length, s.list.total, s.lastPage, FOLLOWED_PAGE);

  return (
    <section aria-labelledby="followed-shops">
      <SectionTitle id="followed-shops">
        {t(locale, "account.followedShops")}
        {s.state === "ready" && s.list.total > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">{t(locale, pluralKey("shops.count", s.list.total), { n: s.list.total })}</span>
        )}
      </SectionTitle>

      {s.state === "loading" && <p className="mt-4 text-sm text-muted">{t(locale, "dash.loading")}</p>}
      {s.state === "error" && (
        <div className="mt-4 space-y-3">
          <p role="alert" className="text-sm text-danger">
            {t(locale, "dash.error.generic")}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setS({ state: "loading" });
              setAttempt(nextLoadKey);
            }}
          >
            {t(locale, "crash.retry")}
          </Button>
        </div>
      )}
      {s.state === "ready" && s.list.nodes.length === 0 && !refilling && (
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
            <li key={sh.id} data-row={sh.id} className="flex items-center gap-4 p-4">
              <ShopLogo name={sh.name} logoUrl={sh.logoUrl} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/shops/${encodeURIComponent(sh.slug)}`} className="font-semibold text-ink hover:text-ink hover:underline underline-offset-4">
                  {sh.name}
                </Link>
                <p className="truncate text-sm text-muted">
                  {[sh.city, t(locale, pluralKey("shops.coffeesCount", sh.coffeeCount), { n: sh.coffeeCount })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                type="button"
                onClick={(e) => unfollow(sh.id, e.currentTarget.closest("[data-row]"))}
                data-row-action
                pending={removing === sh.id}
                disabled={removing !== null && removing !== sh.id}
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
            onClick={() => void loadMore()}
            pending={s.more === "loading"}
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
