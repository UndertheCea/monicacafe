// Followed-shop helpers (pure, no imports, so `npm test` can load them).

/** What the follow button shows: whether the viewer follows the shop, and how many people do. */
export interface FollowState {
  following: boolean;
  count: number;
}

/**
 * The state after the viewer toggles to `following`, shown before the API
 * answers (rolled back on error). Toggling to the current state changes
 * nothing, and the count never drops below zero.
 */
export function toggleFollow(state: FollowState, following: boolean): FollowState {
  if (state.following === following) return state;
  return { following, count: Math.max(0, state.count + (following ? 1 : -1)) };
}

/** Takes the API's answer over the optimistic guess; null (the shop is gone) keeps the guess. */
export function settleFollow(
  guess: FollowState,
  result: { isFollowed: boolean; followerCount: number } | null,
): FollowState {
  return result ? { following: result.isFollowed, count: result.followerCount } : guess;
}

/**
 * Which control the shop page shows: nothing while the session loads, a login
 * link when signed out, only the count to the shop's owner (the API refuses
 * self-follows), the toggle otherwise.
 */
export function followControl(
  status: "loading" | "anonymous" | "authenticated",
  viewerShopId: string | null | undefined,
  shopId: string,
): "none" | "login" | "owner" | "toggle" {
  if (status === "loading") return "none";
  if (status === "anonymous") return "login";
  return viewerShopId === shopId ? "owner" : "toggle";
}

/** Followed shops per page on /account. */
export const FOLLOWED_PAGE = 12;
