"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FOLLOWING_COFFEES, type CoffeeCardData } from "@/lib/api";
import { FEED_COUNT, showFollowingFeed } from "@/lib/follows";
import { t, type Locale } from "@/lib/i18n/dict";

/**
 * Home page "你追蹤的烘豆師 / From roasters you follow". The page is rendered
 * anonymously, so this fetches with the viewer's token once signed in; it
 * renders nothing when signed out, on error, or when the feed is empty.
 */
export function FollowingFeed({ locale }: { locale: Locale }) {
  const { status, request } = useAuth();
  const [feed, setFeed] = useState<{ nodes: CoffeeCardData[] } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    request(FOLLOWING_COFFEES, { limit: FEED_COUNT })
      .then((r) => live && setFeed(r.followingCoffees))
      .catch(() => live && setFeed(null));
    return () => {
      live = false;
    };
  }, [status, request]);

  if (!feed || !showFollowingFeed(status, feed)) return null;
  return (
    <section aria-labelledby="following" className="px-4 pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="following" className="text-2xl font-bold text-ink">
              {t(locale, "home.following")}
            </h2>
            <p className="mt-1 text-neutral-600">{t(locale, "home.followingSub")}</p>
          </div>
          <Link href="/account#followed-shops" className="shrink-0 text-sm font-medium text-ink underline-offset-4 hover:underline">
            {t(locale, "home.followingManage")}
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {feed.nodes.map((c) => (
            <CoffeeCard key={c.id} coffee={c} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}
