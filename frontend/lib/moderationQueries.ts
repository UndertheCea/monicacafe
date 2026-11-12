// GraphQL documents for reports and the /admin screen (#225). The admin
// fields refuse anyone the database doesn't list as an admin.
import { typed } from "./graphql";
import type { ReportReason, ReportResolution, ReportStatus, ReportTargetType } from "./moderation";

/** Rows per page on /admin. */
export const ADMIN_PAGE = 20;

export const REPORT = typed<
  { report: boolean },
  { targetType: ReportTargetType; targetId: string; reason: ReportReason; note?: string }
>(/* GraphQL */ `
  mutation Report($targetType: ReportTargetType!, $targetId: ID!, $reason: ReportReason!, $note: String) {
    report(targetType: $targetType, targetId: $targetId, reason: $reason, note: $note)
  }
`);

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  createdAt: string;
  reporter: { displayName: string } | null;
  comment: { id: string; body: string; user: { id: string; displayName: string }; coffee: { id: string; name: string } | null } | null;
  shop: { id: string; slug: string; name: string } | null;
  coffee: { id: string; name: string; shop: { name: string } } | null;
}

const REPORT_FIELDS = `id targetType targetId reason note status createdAt
  reporter { displayName }
  comment { id body user { id displayName } coffee { id name } }
  shop { id slug name }
  coffee { id name shop { name } }`;

export const ADMIN_REPORTS = typed<
  { reports: { total: number; nodes: AdminReport[] } },
  { status?: ReportStatus; limit: number; offset: number }
>(/* GraphQL */ `
  query AdminReports($status: ReportStatus, $limit: Int, $offset: Int) {
    reports(status: $status, limit: $limit, offset: $offset) { total nodes { ${REPORT_FIELDS} } }
  }
`);

export const RESOLVE_REPORT = typed<
  { resolveReport: { id: string; status: ReportStatus } },
  { id: string; action: ReportResolution; reason?: string }
>(/* GraphQL */ `
  mutation ResolveReport($id: ID!, $action: ReportResolution!, $reason: String) {
    resolveReport(id: $id, action: $action, reason: $reason) { id status }
  }
`);

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  role: "BUYER" | "SELLER" | "ADMIN";
  suspended: boolean;
  createdAt: string;
}

const ADMIN_USER_FIELDS = `id email displayName role suspended createdAt`;

export const ADMIN_USERS = typed<
  { adminUsers: { total: number; nodes: AdminUser[] } },
  { search?: string; limit: number; offset: number }
>(/* GraphQL */ `
  query AdminUsers($search: String, $limit: Int, $offset: Int) {
    adminUsers(search: $search, limit: $limit, offset: $offset) { total nodes { ${ADMIN_USER_FIELDS} } }
  }
`);

export interface AdminShop {
  id: string;
  slug: string;
  name: string;
  city: string;
  suspended: boolean;
  createdAt: string;
}

const ADMIN_SHOP_FIELDS = `id slug name city suspended createdAt`;

export const ADMIN_SHOPS = typed<
  { adminShops: { total: number; nodes: AdminShop[] } },
  { search?: string; limit: number; offset: number }
>(/* GraphQL */ `
  query AdminShops($search: String, $limit: Int, $offset: Int) {
    adminShops(search: $search, limit: $limit, offset: $offset) { total nodes { ${ADMIN_SHOP_FIELDS} } }
  }
`);

type ReasonVars = { id: string; reason: string };

export const SUSPEND_USER = typed<{ suspendUser: AdminUser }, ReasonVars>(/* GraphQL */ `
  mutation SuspendUser($id: ID!, $reason: String!) { suspendUser(id: $id, reason: $reason) { ${ADMIN_USER_FIELDS} } }
`);

export const UNSUSPEND_USER = typed<{ unsuspendUser: AdminUser }, ReasonVars>(/* GraphQL */ `
  mutation UnsuspendUser($id: ID!, $reason: String!) { unsuspendUser(id: $id, reason: $reason) { ${ADMIN_USER_FIELDS} } }
`);

export const SUSPEND_SHOP = typed<{ suspendShop: AdminShop }, ReasonVars>(/* GraphQL */ `
  mutation SuspendShop($id: ID!, $reason: String!) { suspendShop(id: $id, reason: $reason) { ${ADMIN_SHOP_FIELDS} } }
`);

export const UNSUSPEND_SHOP = typed<{ unsuspendShop: AdminShop }, ReasonVars>(/* GraphQL */ `
  mutation UnsuspendShop($id: ID!, $reason: String!) { unsuspendShop(id: $id, reason: $reason) { ${ADMIN_SHOP_FIELDS} } }
`);

export interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
  actor: { displayName: string } | null;
}

export const AUDIT_LOG = typed<{ auditLog: { total: number; nodes: AuditRow[] } }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query AuditLog($limit: Int, $offset: Int) {
      auditLog(limit: $limit, offset: $offset) { total nodes { id action targetType targetId reason createdAt actor { displayName } } }
    }
  `,
);
