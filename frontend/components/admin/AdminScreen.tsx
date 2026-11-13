"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { FormError, Notice } from "@/components/dashboard/ui";
import { Badge, Button, Card, Field, Input, Label, SectionTitle } from "@/components/ui";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import {
  MODERATION_REASON_MAX,
  adminErrorKey,
  appendRows,
  auditActionKey,
  auditTargetKey,
  isAdminViewer,
  moderationReasonProblem,
  reportTargetHref,
  withUpdatedRow,
  withoutTarget,
  type ReportResolution,
} from "@/lib/moderation";
import {
  ADMIN_PAGE,
  ADMIN_REPORTS,
  ADMIN_SHOPS,
  ADMIN_USERS,
  AUDIT_LOG,
  RESOLVE_REPORT,
  SUSPEND_SHOP,
  SUSPEND_USER,
  UNSUSPEND_SHOP,
  UNSUSPEND_USER,
  type AdminReport,
  type AdminShop,
  type AdminUser,
  type AuditRow,
} from "@/lib/moderationQueries";
import { formatTaipeiDate } from "@/lib/utils";

/**
 * The moderation screen (#225): open reports with their resolve actions,
 * account and shop search with suspend / reinstate (reason required), and the
 * audit log. Admins only; the API enforces it on every call, this only keeps
 * the screen from showing to anyone else. Seller and buyer text is rendered
 * as text only.
 */
export function AdminScreen({ locale }: { locale: Locale }) {
  const { status, user } = useAuth();
  if (status === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (status === "anonymous") {
    return (
      <Notice>
        {t(locale, "admin.forbidden")}{" "}
        <Link href="/login?next=%2Fadmin" className="font-semibold text-ink underline-offset-4 hover:underline">
          {t(locale, "nav.login")}
        </Link>
      </Notice>
    );
  }
  if (!isAdminViewer(user)) return <Notice>{t(locale, "admin.forbidden")}</Notice>;
  return (
    <div className="space-y-8">
      <ReportsSection locale={locale} />
      <UsersSection locale={locale} />
      <ShopsSection locale={locale} />
      <AuditSection locale={locale} />
    </div>
  );
}

// ─── Shared pieces ─────────────────────────────────────────────────────────

type Page<T> = { total: number; nodes: T[] };
type ListState<T> = { state: "loading" } | { state: "error" } | ({ state: "ready" } & Page<T>);

/** A paged admin list: loads the first page whenever fetchPage changes, then "load more". */
function useAdminList<T extends { id: string }>(fetchPage: (offset: number) => Promise<Page<T>>) {
  const [list, setList] = useState<ListState<T>>({ state: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (p) => live && setList({ state: "ready", ...p }),
      () => live && setList({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (list.state !== "ready" || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = await fetchPage(list.nodes.length);
      setList((cur) => (cur.state === "ready" ? { state: "ready", total: p.total, nodes: appendRows(cur.nodes, p.nodes) } : cur));
    } catch {
      // Keep what is shown; the button stays for another try.
    } finally {
      setLoadingMore(false);
    }
  }

  const update = (fn: (p: Page<T>) => Page<T>) =>
    setList((cur) => (cur.state === "ready" ? { state: "ready", ...fn(cur) } : cur));
  return { list, setList, loadMore, loadingMore, update };
}

function Section({ title, count, locale, children }: { title: string; count?: number; locale: Locale; children: ReactNode }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <SectionTitle id={id}>{title}</SectionTitle>
        {count !== undefined && <span className="text-sm text-muted">{t(locale, "admin.count", { n: count })}</span>}
      </div>
      {children}
    </Card>
  );
}

function ListBody<T>({
  list,
  empty,
  locale,
  children,
  onMore,
  loadingMore,
}: {
  list: ListState<T>;
  empty: MessageKey;
  locale: Locale;
  children: (nodes: T[]) => ReactNode;
  onMore: () => void;
  loadingMore: boolean;
}) {
  if (list.state === "loading") return <p className="text-sm text-muted">{t(locale, "dash.loading")}</p>;
  if (list.state === "error") return <FormError>{t(locale, "admin.loadError")}</FormError>;
  if (list.nodes.length === 0) return <p className="text-sm text-muted">{t(locale, empty)}</p>;
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children(list.nodes)}</div>
      {list.nodes.length < list.total && (
        <Button variant="secondary" size="sm" onClick={onMore} pending={loadingMore} className="mt-4">
          {t(locale, "admin.more")}
        </Button>
      )}
    </>
  );
}

const thCls = "border-b border-line py-2 pr-4 text-left text-xs font-semibold text-muted";
const tdCls = "border-b border-line py-3 pr-4 align-top";

/** A reason field with Confirm / Cancel, shown under the row being acted on. */
function ReasonPrompt({
  locale,
  required,
  onConfirm,
  onCancel,
}: {
  locale: Locale;
  required: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = moderationReasonProblem(reason, required);
    if (problem) {
      return setError(
        problem === "required" ? { key: "admin.reasonRequired" } : { key: "admin.reasonTooLong", vars: { max: MODERATION_REASON_MAX } },
      );
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError({ key: adminErrorKey(toApiError(err).code) });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2 py-2">
      <Field
        id={id}
        label={t(locale, required ? "admin.reasonLabel" : "admin.noteLabel")}
        error={error ? t(locale, error.key, error.vars) : undefined}
        className="min-w-0 flex-1 basis-60"
      >
        {(p) => (
          <Input {...p} value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} autoFocus />
        )}
      </Field>
      <Button type="submit" size="sm" pending={busy}>
        {t(locale, "admin.confirm")}
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
        {t(locale, "admin.cancel")}
      </Button>
    </form>
  );
}

function SearchForm({ locale, placeholder, onSearch }: { locale: Locale; placeholder: MessageKey; onSearch: (q: string) => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
      className="mb-4 flex flex-wrap items-end gap-2"
    >
      <label htmlFor={id} className="sr-only">
        {t(locale, placeholder)}
      </label>
      <Input
        id={id}
        search
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(locale, placeholder)}
        maxLength={100}
        className="min-w-0 flex-1 basis-60"
      />
      <Button type="submit" variant="secondary">
        {t(locale, "admin.search")}
      </Button>
    </form>
  );
}

const date = (iso: string, locale: Locale) => (
  <time dateTime={iso} className="whitespace-nowrap text-xs text-muted">
    {formatTaipeiDate(iso, locale)}
  </time>
);

// ─── Reports ───────────────────────────────────────────────────────────────

function ReportsSection({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    (offset: number) => request(ADMIN_REPORTS, { status: "OPEN", limit: ADMIN_PAGE, offset }).then((r) => r.reports),
    [request],
  );
  const { list, loadMore, loadingMore, update } = useAdminList(fetchPage);
  const [acting, setActing] = useState<{ id: string; action: ReportResolution } | null>(null);

  return (
    <Section title={t(locale, "admin.reports")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <ListBody list={list} empty="admin.reportsEmpty" locale={locale} onMore={loadMore} loadingMore={loadingMore}>
        {(nodes) => (
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>{t(locale, "admin.col.target")}</th>
                <th className={thCls}>{t(locale, "admin.col.reason")}</th>
                <th className={thCls}>{t(locale, "admin.col.reporter")}</th>
                <th className={thCls}>{t(locale, "admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  locale={locale}
                  acting={acting?.id === r.id ? acting.action : null}
                  onAct={(action) => setActing({ id: r.id, action })}
                  onCancel={() => setActing(null)}
                  onResolve={async (action, reason) => {
                    await request(RESOLVE_REPORT, { id: r.id, action, ...(reason ? { reason } : {}) });
                    setActing(null);
                    update((p) => withoutTarget(p, r));
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </Section>
  );
}

function ReportTarget({ r, locale }: { r: AdminReport; locale: Locale }) {
  let what: ReactNode = <span className="text-muted">{t(locale, "admin.targetGone")}</span>;
  if (r.comment) {
    what = (
      <>
        <span className="line-clamp-3 whitespace-pre-line break-words text-ink">{r.comment.body}</span>
        <span className="block text-xs text-muted">
          {r.comment.user.displayName}
          {r.comment.coffee && <> · {t(locale, "admin.commentOn", { name: r.comment.coffee.name })}</>}
        </span>
      </>
    );
  } else if (r.shop) {
    what = <span className="text-ink">{r.shop.name}</span>;
  } else if (r.coffee) {
    what = (
      <span className="text-ink">
        {r.coffee.name} <span className="text-xs text-muted">· {r.coffee.shop.name}</span>
      </span>
    );
  }
  const href = reportTargetHref(r);
  return (
    <div className="space-y-1">
      <Label as="span" className="block">
        {t(locale, `admin.target.${r.targetType}`)}
      </Label>
      {what}
      {href && (
        <Link href={href} target="_blank" className="block text-xs font-semibold text-ink underline-offset-4 hover:underline">
          {t(locale, "admin.view")}
        </Link>
      )}
    </div>
  );
}

function ReportRow({
  report: r,
  locale,
  acting,
  onAct,
  onCancel,
  onResolve,
}: {
  report: AdminReport;
  locale: Locale;
  acting: ReportResolution | null;
  onAct: (a: ReportResolution) => void;
  onCancel: () => void;
  onResolve: (a: ReportResolution, reason: string) => Promise<void>;
}) {
  return (
    <>
      <tr>
        <td className={`${tdCls} max-w-xs`}>
          <ReportTarget r={r} locale={locale} />
        </td>
        <td className={tdCls}>
          <span className="block text-ink">{t(locale, `report.reason.${r.reason}`)}</span>
          {r.note && <span className="block whitespace-pre-line break-words text-xs text-muted">{r.note}</span>}
        </td>
        <td className={tdCls}>
          <span className="block text-ink">{r.reporter?.displayName ?? "—"}</span>
          {date(r.createdAt, locale)}
        </td>
        <td className={tdCls}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onAct("DISMISS")}>
              {t(locale, "admin.dismiss")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAct("ACTIONED")}>
              {t(locale, "admin.markActioned")}
            </Button>
            {(r.comment || r.shop || r.coffee) && (
              <Button size="sm" variant="danger" onClick={() => onAct("REMOVE")}>
                {t(locale, "admin.remove")}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {acting && (
        <tr>
          <td colSpan={4} className={tdCls}>
            <ReasonPrompt
              key={acting}
              locale={locale}
              required={acting === "REMOVE"}
              onConfirm={(reason) => onResolve(acting, reason)}
              onCancel={onCancel}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Users and shops ───────────────────────────────────────────────────────

function UsersSection({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (offset: number) =>
      request(ADMIN_USERS, { ...(search ? { search } : {}), limit: ADMIN_PAGE, offset }).then((r) => r.adminUsers),
    [request, search],
  );
  const { list, setList, loadMore, loadingMore, update } = useAdminList(fetchPage);
  const [acting, setActing] = useState<string | null>(null);

  return (
    <Section title={t(locale, "admin.users")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <SearchForm
        locale={locale}
        placeholder="admin.searchUsers"
        onSearch={(q) => {
          if (q === search) return;
          setList({ state: "loading" });
          setSearch(q);
        }}
      />
      <ListBody list={list} empty="admin.noResults" locale={locale} onMore={loadMore} loadingMore={loadingMore}>
        {(nodes) => (
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>{t(locale, "admin.col.user")}</th>
                <th className={thCls}>{t(locale, "admin.col.role")}</th>
                <th className={thCls}>{t(locale, "admin.col.status")}</th>
                <th className={thCls}>{t(locale, "admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((u) => (
                <SuspendRow
                  key={u.id}
                  locale={locale}
                  suspended={u.suspended}
                  canAct={u.role !== "ADMIN"}
                  acting={acting === u.id}
                  onAct={() => setActing(u.id)}
                  onCancel={() => setActing(null)}
                  onConfirm={async (reason) => {
                    const r = u.suspended
                      ? (await request(UNSUSPEND_USER, { id: u.id, reason })).unsuspendUser
                      : (await request(SUSPEND_USER, { id: u.id, reason })).suspendUser;
                    setActing(null);
                    update((p) => withUpdatedRow<AdminUser>(p, r));
                  }}
                  cells={
                    <>
                      <td className={tdCls}>
                        <span className="block text-ink">{u.displayName}</span>
                        <span className="block break-all text-xs text-muted">{u.email}</span>
                      </td>
                      <td className={tdCls}>{t(locale, `admin.role.${u.role}`)}</td>
                    </>
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </Section>
  );
}

function ShopsSection({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (offset: number) =>
      request(ADMIN_SHOPS, { ...(search ? { search } : {}), limit: ADMIN_PAGE, offset }).then((r) => r.adminShops),
    [request, search],
  );
  const { list, setList, loadMore, loadingMore, update } = useAdminList(fetchPage);
  const [acting, setActing] = useState<string | null>(null);

  return (
    <Section title={t(locale, "admin.shops")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <SearchForm
        locale={locale}
        placeholder="admin.searchShops"
        onSearch={(q) => {
          if (q === search) return;
          setList({ state: "loading" });
          setSearch(q);
        }}
      />
      <ListBody list={list} empty="admin.noResults" locale={locale} onMore={loadMore} loadingMore={loadingMore}>
        {(nodes) => (
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>{t(locale, "admin.col.shop")}</th>
                <th className={thCls}>{t(locale, "dash.city")}</th>
                <th className={thCls}>{t(locale, "admin.col.status")}</th>
                <th className={thCls}>{t(locale, "admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((s) => (
                <SuspendRow
                  key={s.id}
                  locale={locale}
                  suspended={s.suspended}
                  canAct
                  acting={acting === s.id}
                  onAct={() => setActing(s.id)}
                  onCancel={() => setActing(null)}
                  onConfirm={async (reason) => {
                    const r = s.suspended
                      ? (await request(UNSUSPEND_SHOP, { id: s.id, reason })).unsuspendShop
                      : (await request(SUSPEND_SHOP, { id: s.id, reason })).suspendShop;
                    setActing(null);
                    update((p) => withUpdatedRow<AdminShop>(p, r));
                  }}
                  cells={
                    <>
                      <td className={tdCls}>
                        <Link
                          href={`/shops/${encodeURIComponent(s.slug)}`}
                          target="_blank"
                          className="block text-ink underline-offset-4 hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="block font-mono text-xs text-muted">{s.slug}</span>
                      </td>
                      <td className={tdCls}>{s.city}</td>
                    </>
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </Section>
  );
}

/** A user or shop row: its own cells, then status and suspend / reinstate (reason required). */
function SuspendRow({
  locale,
  cells,
  suspended,
  canAct,
  acting,
  onAct,
  onCancel,
  onConfirm,
}: {
  locale: Locale;
  cells: ReactNode;
  suspended: boolean;
  canAct: boolean;
  acting: boolean;
  onAct: () => void;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  return (
    <>
      <tr>
        {cells}
        <td className={tdCls}>
          <Badge tone={suspended ? "danger" : "soft"}>{t(locale, suspended ? "admin.suspended" : "admin.active")}</Badge>
        </td>
        <td className={tdCls}>
          {canAct && (
            <Button size="sm" variant={suspended ? "secondary" : "danger"} onClick={onAct}>
              {t(locale, suspended ? "admin.unsuspend" : "admin.suspend")}
            </Button>
          )}
        </td>
      </tr>
      {acting && (
        <tr>
          <td colSpan={4} className={tdCls}>
            <ReasonPrompt locale={locale} required onConfirm={onConfirm} onCancel={onCancel} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Audit log ─────────────────────────────────────────────────────────────

function AuditSection({ locale }: { locale: Locale }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    (offset: number) => request(AUDIT_LOG, { limit: ADMIN_PAGE, offset }).then((r) => r.auditLog),
    [request],
  );
  const { list, loadMore, loadingMore } = useAdminList<AuditRow>(fetchPage);

  return (
    <Section title={t(locale, "admin.audit")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <ListBody list={list} empty="admin.auditEmpty" locale={locale} onMore={loadMore} loadingMore={loadingMore}>
        {(nodes) => (
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>{t(locale, "admin.col.date")}</th>
                <th className={thCls}>{t(locale, "admin.col.action")}</th>
                <th className={thCls}>{t(locale, "admin.col.target")}</th>
                <th className={thCls}>{t(locale, "admin.col.reason")}</th>
                <th className={thCls}>{t(locale, "admin.col.actor")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((e) => (
                <tr key={e.id}>
                  <td className={tdCls}>{date(e.createdAt, locale)}</td>
                  <td className={`${tdCls} text-ink`}>{auditLabel(locale, e.action)}</td>
                  <td className={tdCls}>
                    <span className="block text-ink">{auditTarget(locale, e.targetType)}</span>
                    <span className="block font-mono text-xs text-muted">{e.targetId.slice(0, 8)}</span>
                  </td>
                  <td className={`${tdCls} max-w-xs whitespace-pre-line break-words text-ink`}>{e.reason || "—"}</td>
                  <td className={tdCls}>{e.actor?.displayName ?? <span className="text-muted">{t(locale, "admin.cli")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </Section>
  );
}

/** The audit action's label; an action this build doesn't know shows as sent. */
function auditLabel(locale: Locale, action: string): string {
  const key = auditActionKey(action);
  return key ? t(locale, key) : action;
}

function auditTarget(locale: Locale, type: string): string {
  const key = auditTargetKey(type);
  return key ? t(locale, key) : type;
}
