// Moderation helpers (#225): reporting comments and shops, the "no contact
// details" rule and the /admin screen. Pure, no imports, so `npm test` can load
// this file directly.

/** The backend's error code for text with a phone number, email, link or LINE / IG / FB ID. */
export const CONTACT_INFO_CODE = "CONTACT_INFO_NOT_ALLOWED";

/** Whether an API error is the "no contact details" refusal (for comments and descriptions). */
export function isContactInfoError(code: string | undefined): boolean {
  return code === CONTACT_INFO_CODE;
}

export const REPORT_REASONS = ["SPAM", "CONTACT_INFO", "OFFENSIVE", "MISLEADING", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = "COMMENT" | "SHOP" | "COFFEE";
export type ReportStatus = "OPEN" | "ACTIONED" | "DISMISSED";
export type ReportResolution = "DISMISS" | "ACTIONED" | "REMOVE";

/** Characters (runes) allowed in a report's note and an admin's reason, as the API counts them. */
export const REPORT_NOTE_MAX = 500;
export const MODERATION_REASON_MAX = 500;

const runes = (s: string) => [...s.trim()].length;

/** Whether a report can be sent: a known reason and a note within the limit. */
export function canSubmitReport(reason: string | null, note: string): boolean {
  return !!reason && (REPORT_REASONS as readonly string[]).includes(reason) && runes(note) <= REPORT_NOTE_MAX;
}

/** Message key for a failed report (RATE_LIMITED is handled by the caller with its wait time). */
export function reportErrorKey(code: string): "report.error.signIn" | "report.error.gone" | "report.error.generic" {
  if (code === "UNAUTHENTICATED") return "report.error.signIn";
  if (code === "NOT_FOUND") return "report.error.gone";
  return "report.error.generic";
}

/** Who may see the report action: signed in, and not the comment's author or the shop's owner. */
export function canReport(viewer: { id: string; shopId?: string | null } | null, target: { authorId?: string; shopId?: string }): boolean {
  if (!viewer) return false;
  if (target.authorId && target.authorId === viewer.id) return false;
  if (target.shopId && viewer.shopId && target.shopId === viewer.shopId) return false;
  return true;
}

/** The /admin screen is for admins only (the API checks again on every call). */
export function isAdminViewer(user: { role: string } | null | undefined): boolean {
  return user?.role === "ADMIN";
}

/**
 * An admin's reason for suspending, unsuspending or taking something down:
 * required, at most 500 characters. null when it is fine.
 */
export function moderationReasonProblem(reason: string, required = true): "required" | "tooLong" | null {
  const n = runes(reason);
  if (required && n === 0) return "required";
  if (n > MODERATION_REASON_MAX) return "tooLong";
  return null;
}

/** Message key for a failed admin action. */
export function adminErrorKey(code: string): "admin.error.forbidden" | "admin.error.state" | "admin.error.gone" | "admin.error.generic" {
  if (code === "FORBIDDEN" || code === "UNAUTHENTICATED") return "admin.error.forbidden";
  if (code === "BAD_USER_INPUT") return "admin.error.state";
  if (code === "NOT_FOUND") return "admin.error.gone";
  return "admin.error.generic";
}

/** The fields of a report the admin list needs to link to its target. */
export interface ReportTargetLinks {
  targetType: ReportTargetType;
  comment: { coffee: { id: string } | null } | null;
  shop: { slug: string } | null;
  coffee: { id: string } | null;
}

/** Where the admin can look at a reported thing; null when it has been deleted. */
export function reportTargetHref(r: ReportTargetLinks): string | null {
  switch (r.targetType) {
    case "COMMENT":
      return r.comment?.coffee ? `/coffees/${encodeURIComponent(r.comment.coffee.id)}` : null;
    case "COFFEE":
      return r.coffee ? `/coffees/${encodeURIComponent(r.coffee.id)}` : null;
    case "SHOP":
      return r.shop ? `/shops/${encodeURIComponent(r.shop.slug)}` : null;
  }
  return null;
}

/**
 * The open-report list after one is resolved: the API closes every open
 * report on the same target, so all their rows go and the total drops by as
 * many as were shown.
 */
export function withoutTarget<T extends { targetType: string; targetId: string }>(
  page: { total: number; nodes: T[] },
  target: { targetType: string; targetId: string },
) {
  const nodes = page.nodes.filter((r) => !(r.targetType === target.targetType && r.targetId === target.targetId));
  return { total: Math.max(0, page.total - (page.nodes.length - nodes.length)), nodes };
}

/** Appends a fetched page to the rows already shown, skipping ids already there (offset paging can shift). */
export function appendRows<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((r) => r.id));
  return [...shown, ...page.filter((r) => !seen.has(r.id))];
}

/** A list with one row replaced by the API's updated copy (a suspended user or shop). */
export function withUpdatedRow<T extends { id: string }>(page: { total: number; nodes: T[] }, row: T) {
  return { total: page.total, nodes: page.nodes.map((n) => (n.id === row.id ? { ...n, ...row } : n)) };
}

/** Audit-log actions the backend records (graph/schema.graphqls AuditAction). */
export const AUDIT_ACTIONS = [
  "SUSPEND_USER",
  "UNSUSPEND_USER",
  "SUSPEND_SHOP",
  "UNSUSPEND_SHOP",
  "UNPUBLISH_COFFEE",
  "DELETE_COMMENT",
  "DELETE_ACCOUNT",
  "CHANGE_PASSWORD",
  "GRANT_ADMIN",
  "REVOKE_ADMIN",
  "DISMISS_REPORT",
  "ACTION_REPORT",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Message key for an audit action; null for one this build doesn't know (shown as sent). */
export function auditActionKey(action: string): `admin.audit.${AuditAction}` | null {
  const a = AUDIT_ACTIONS.find((x) => x === action);
  return a ? `admin.audit.${a}` : null;
}

const AUDIT_TARGETS = ["USER", "SHOP", "COFFEE", "COMMENT"] as const;

/** Message key for an audit / report target type; null when unknown. */
export function auditTargetKey(type: string): `admin.target.${(typeof AUDIT_TARGETS)[number]}` | null {
  const k = AUDIT_TARGETS.find((x) => x === type);
  return k ? `admin.target.${k}` : null;
}
