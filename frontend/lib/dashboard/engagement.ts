// Buyer engagement line on the dashboard coffee list. Import-free so `npm test` loads it.

export type EngagementKey = "dash.comments.one" | "dash.comments.other" | "dash.saves.one" | "dash.saves.other";
export type FollowerKey = "dash.followers.one" | "dash.followers.other";

/**
 * The message keys (with counts) for a coffee's "N comments · N saves" line,
 * singular for exactly one. Negative or missing counts read as zero. Saves
 * stay listed on drafts: unpublishing a coffee doesn't remove them.
 */
export function engagementParts(c: { commentCount?: number | null; saveCount?: number | null }): {
  key: EngagementKey;
  n: number;
}[] {
  const count = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? Math.floor(v) : 0);
  const comments = count(c.commentCount);
  const saves = count(c.saveCount);
  return [
    { key: comments === 1 ? "dash.comments.one" : "dash.comments.other", n: comments },
    { key: saves === 1 ? "dash.saves.one" : "dash.saves.other", n: saves },
  ];
}

/** The dashboard header's "N followers" (singular for exactly one; bad counts read as zero). */
export function followerPart(followerCount: number | null | undefined): { key: FollowerKey; n: number } {
  const n = typeof followerCount === "number" && followerCount > 0 ? Math.floor(followerCount) : 0;
  return { key: n === 1 ? "dash.followers.one" : "dash.followers.other", n };
}
