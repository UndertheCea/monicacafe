"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { FOLLOW_SHOP, SHOP_FOLLOWED, UNFOLLOW_SHOP } from "@/lib/api";
import { rateLimitMessage } from "@/lib/errors";
import { followControl, settleFollow, toggleFollow, type FollowState } from "@/lib/follows";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";

const pillCls =
  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition disabled:opacity-60";

/**
 * "追蹤 / Follow" toggle with the follower count. Like SaveButton, the page is
 * rendered anonymously, so the viewer's own state is fetched once signed in;
 * the toggle is optimistic and rolls back if the API refuses. The shop's owner
 * sees only the count.
 */
export function FollowButton({
  shopId,
  slug,
  followerCount,
  locale,
}: {
  shopId: string;
  slug: string;
  followerCount: number;
  locale: Locale;
}) {
  const { status, user, request } = useAuth();
  const pathname = usePathname();
  const [state, setState] = useState<FollowState>({ following: false, count: followerCount });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);
  const control = followControl(status, user?.shop?.id, shopId);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    request(SHOP_FOLLOWED, { slug })
      .then((r) => {
        if (live && r.shop) setState({ following: r.shop.isFollowed, count: r.shop.followerCount });
      })
      .catch(() => {
        // Keep the server-rendered count; the button still works.
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [status, request, slug]);

  const count = (
    <span className="text-xs font-normal text-stone-500">{t(locale, "follow.count", { n: state.count })}</span>
  );

  if (control !== "toggle") {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-3">
        {control === "login" && (
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className={`${pillCls} bg-white text-stone-700 ring-stone-300 hover:bg-stone-50`}
          >
            <span aria-hidden>＋</span> {t(locale, "follow.loginToFollow")}
          </Link>
        )}
        {count}
      </p>
    );
  }

  async function onToggle() {
    if (busy) return;
    const before = state;
    const guess = toggleFollow(state, !state.following);
    setState(guess);
    setBusy(true);
    setError(null);
    try {
      const result = guess.following
        ? (await request(FOLLOW_SHOP, { id: shopId })).followShop
        : (await request(UNFOLLOW_SHOP, { id: shopId })).unfollowShop;
      setState(settleFollow(guess, result));
    } catch (err) {
      setState(before);
      const e = toApiError(err);
      setError(e.code === "RATE_LIMITED" ? rateLimitMessage(e.retryAfter) : { key: "follow.error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy || !loaded}
          aria-pressed={state.following}
          className={
            state.following
              ? `${pillCls} bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100`
              : `${pillCls} bg-stone-900 text-white ring-stone-900 hover:bg-stone-700`
          }
        >
          <span aria-hidden>{state.following ? "✓" : "＋"}</span>
          {t(locale, state.following ? "follow.following" : "follow.follow")}
        </button>
        {count}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {t(locale, error.key, error.vars)}
        </p>
      )}
    </div>
  );
}
