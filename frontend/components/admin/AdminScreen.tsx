"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { focusAfterRemoval, focusLoadedRow } from "@/components/focusAfterRemoval";
import { firstNewRow } from "@/lib/loadMore";
import { ReasonPrompt } from "@/components/admin/ReasonPrompt";
import { useAuth } from "@/components/auth/AuthProvider";
import { nextLoadKey, submitSearch } from "@/lib/retry";
import { FormError, Notice } from "@/components/dashboard/ui";
import { Badge, Button, Card, Input, Label, SectionTitle } from "@/components/ui";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import {
  mergeAdminPage,
  nextReloadVersion,
  adminListKey,
  auditActionKey,
  auditTargetKey,
  isAdminViewer,
  reportTargetHref,
  withUpdatedRow,
  withoutRow,
  withoutTarget,
  type ReportResolution,
} from "@/lib/moderation";
import {
  ADMIN_PAGE,
  ADMIN_REPORTS,
  ADMIN_SHOPS,
  ADMIN_TAKEN_DOWN_COFFEES,
  ADMIN_USERS,
  AUDIT_LOG,
  RESOLVE_REPORT,
  RESTORE_COFFEE,
  SUSPEND_SHOP,
  SUSPEND_USER,
  UNSUSPEND_SHOP,
  UNSUSPEND_USER,
  type AdminReport,
  type AdminShop,
  type AdminUser,
  type AuditRow,
  type TakenDownCoffee,
} from "@/lib/moderationQueries";
import { formatTaipeiDate } from "@/lib/utils";
import { RetryButton } from "@/components/RetryButton";

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
  return <AdminSections locale={locale} />;
}

function AdminSections({ locale }: { locale: Locale }) {
  // Bumped after every successful moderation action so every list reloads its first page: the audit
  // log (#370), and reports / users / shops, since one action changes rows in the others too
  // (suspending a user suspends their shop; resolving a report suspends or takes down).
  const [auditVersion, setAuditVersion] = useState(0);
  const onModerated = useCallback(() => setAuditVersion(nextReloadVersion), []);
  return (
    <div className="space-y-8">
      <ReportsSection locale={locale} onModerated={onModerated} version={auditVersion} />
      <UsersSection locale={locale} onModerated={onModerated} version={auditVersion} />
      <ShopsSection locale={locale} onModerated={onModerated} version={auditVersion} />
      <TakenDownSection locale={locale} onModerated={onModerated} version={auditVersion} />
      <AuditSection locale={locale} version={auditVersion} />
    </div>
  );
}

// ─── Shared pieces ─────────────────────────────────────────────────────────

type Page<T> = { total: number; nodes: T[] };
type ListState<T> = { state: "loading" } | { state: "error" } | ({ state: "ready" } & Page<T>);

/** A paged admin list: loads the first page whenever fetchPage changes, then "load more". */
function useAdminList<T extends { id: string }>(fetchPage: (offset: number) => Promise<Page<T>>, version: number | string = 0) {
  const [list, setList] = useState<ListState<T>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" (#437)
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // Bumped whenever the first page reloads (search, tab); a load-more from an older one is dropped (#366).
  const generation = useRef(0);

  useEffect(() => {
    let live = true;
    generation.current += 1;
    fetchPage(0).then(
      (p) => live && (setMoreFailed(false), setList({ state: "ready", ...p })),
      () => live && setList({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [fetchPage, version, attempt]);

  async function loadMore() {
    if (list.state !== "ready" || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const p = await fetchPage(list.nodes.length);
      setList((cur) => mergeAdminPage(cur, p, gen, generation.current));
      // The last page removes the button: focus goes to the first row it added (#510).
      if (gen === generation.current) focusLoadedRow(firstNewRow(list.nodes, p.nodes));
    } catch {
      // Keep what is shown; the button stays for another try.
      if (gen === generation.current) setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const update = (fn: (p: Page<T>) => Page<T>) =>
    setList((cur) => (cur.state === "ready" ? { state: "ready", ...fn(cur) } : cur));
  const retry = () => {
    setList({ state: "loading" });
    setAttempt(nextLoadKey);
  };
  return { list, setList, loadMore, loadingMore, moreFailed, update, retry };
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
  onRetry,
  loadingMore,
  moreFailed = false,
}: {
  list: ListState<T>;
  empty: MessageKey;
  locale: Locale;
  children: (nodes: T[]) => ReactNode;
  onMore: () => void;
  onRetry: () => void;
  loadingMore: boolean;
  moreFailed?: boolean;
}) {
  if (list.state === "loading") return <p className="text-sm text-muted">{t(locale, "dash.loading")}</p>;
  if (list.state === "error") {
    return (
      <div className="space-y-3">
        <FormError>{t(locale, "admin.loadError")}</FormError>
        <RetryButton locale={locale} size="sm" onRetry={onRetry} />
      </div>
    );
  }
  if (list.nodes.length === 0) return <p className="text-sm text-muted">{t(locale, empty)}</p>;
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children(list.nodes)}</div>
      {list.nodes.length < list.total && (
        <Button variant="secondary" size="sm" onClick={onMore} pending={loadingMore} className="mt-4">
          {t(locale, "admin.more")}
        </Button>
      )}
      {moreFailed && <FormError>{t(locale, "admin.loadError")}</FormError>}
    </>
  );
}

const thCls = "border-b border-line py-2 pr-4 text-left text-xs font-semibold text-muted";
const tdCls = "border-b border-line py-3 pr-4 align-top";

/**
 * Focus for a row's reason prompt (#405): call the returned function before the
 * prompt closes (cancel, or a confirm that keeps the row) and, once it has
 * closed, focus goes back to the button that opened it, if focus was lost.
 */
function useReturnFocus(open: boolean, trigger: RefObject<HTMLElement | null>) {
  const pending = useRef(false);
  useEffect(() => {
    if (open || !pending.current) return;
    pending.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) trigger.current?.focus();
  }, [open, trigger]);
  return () => {
    pending.current = true;
  };
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

const date = (iso: string) => (
  <time dateTime={iso} className="whitespace-nowrap text-xs text-muted">
    {formatTaipeiDate(iso)}
  </time>
);

// ─── Reports ───────────────────────────────────────────────────────────────

function ReportsSection({ locale, onModerated, version }: { locale: Locale; onModerated: () => void; version: number }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    (offset: number) => request(ADMIN_REPORTS, { status: "OPEN", limit: ADMIN_PAGE, offset }).then((r) => r.reports),
    [request],
  );
  const { list, loadMore, loadingMore, moreFailed, update, retry } = useAdminList(fetchPage, version);
  const [acting, setActing] = useState<{ id: string; action: ReportResolution } | null>(null);

  return (
    <Section title={t(locale, "admin.reports")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <ListBody list={list} empty="admin.reportsEmpty" locale={locale} onMore={loadMore} onRetry={retry} loadingMore={loadingMore} moreFailed={moreFailed}>
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
                  onResolve={async (action, reason, row) => {
                    const res = await request(RESOLVE_REPORT, { id: r.id, action, ...(reason ? { reason } : {}) });
                    focusAfterRemoval(row); // the row goes: keep the admin's place (#405)
                    setActing(null);
                    update((p) => withoutTarget(p, r, res.resolveReport.closedCount));
                    onModerated();
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
  onResolve: (a: ReportResolution, reason: string, row: HTMLTableRowElement | null) => Promise<void>;
}) {
  const row = useRef<HTMLTableRowElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const back = useReturnFocus(acting !== null, trigger);
  const act = (a: ReportResolution, e: React.MouseEvent<HTMLButtonElement>) => {
    trigger.current = e.currentTarget;
    onAct(a);
  };
  return (
    <>
      <tr ref={row} data-row={r.id}>
        <td className={`${tdCls} max-w-xs`}>
          <ReportTarget r={r} locale={locale} />
        </td>
        <td className={tdCls}>
          <span className="block text-ink">{t(locale, `report.reason.${r.reason}`)}</span>
          {r.note && <span className="block whitespace-pre-line break-words text-xs text-muted">{r.note}</span>}
        </td>
        <td className={tdCls}>
          <span className="block text-ink">{r.reporter?.displayName ?? "—"}</span>
          {date(r.createdAt)}
        </td>
        <td className={tdCls}>
          <div data-row-action className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={(e) => act("DISMISS", e)}>
              {t(locale, "admin.dismiss")}
            </Button>
            <Button size="sm" variant="secondary" onClick={(e) => act("ACTIONED", e)}>
              {t(locale, "admin.markActioned")}
            </Button>
            {(r.comment || r.shop || r.coffee) && (
              <Button size="sm" variant="danger" onClick={(e) => act("REMOVE", e)}>
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
              onConfirm={(reason) => onResolve(acting, reason, row.current)}
              onCancel={() => (back(), onCancel())}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Users and shops ───────────────────────────────────────────────────────

function UsersSection({ locale, onModerated, version }: { locale: Locale; onModerated: () => void; version: number }) {
  const { request } = useAuth();
  const [{ query: search, key: searchKey }, setSearchState] = useState({ query: "", key: 0 });
  const fetchPage = useCallback(
    (offset: number) =>
      request(ADMIN_USERS, { ...(search ? { search } : {}), limit: ADMIN_PAGE, offset }).then((r) => r.adminUsers),
    [request, search],
  );
  const { list, setList, loadMore, loadingMore, moreFailed, update, retry } = useAdminList(fetchPage, adminListKey(searchKey, version));
  const [acting, setActing] = useState<string | null>(null);

  return (
    <Section title={t(locale, "admin.users")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <p className="mb-3 text-sm text-muted">{t(locale, "admin.suspendUserNote")}</p>
      <SearchForm
        locale={locale}
        placeholder="admin.searchUsers"
        onSearch={(q) => {
          setList({ state: "loading" });
          setSearchState((cur) => submitSearch(cur, q)); // the same query again refetches too (#437)
        }}
      />
      <ListBody list={list} empty="admin.noResults" locale={locale} onMore={loadMore} onRetry={retry} loadingMore={loadingMore} moreFailed={moreFailed}>
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
                  rowId={u.id}
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
                    onModerated();
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

function ShopsSection({ locale, onModerated, version }: { locale: Locale; onModerated: () => void; version: number }) {
  const { request } = useAuth();
  const [{ query: search, key: searchKey }, setSearchState] = useState({ query: "", key: 0 });
  const fetchPage = useCallback(
    (offset: number) =>
      request(ADMIN_SHOPS, { ...(search ? { search } : {}), limit: ADMIN_PAGE, offset }).then((r) => r.adminShops),
    [request, search],
  );
  const { list, setList, loadMore, loadingMore, moreFailed, update, retry } = useAdminList(fetchPage, adminListKey(searchKey, version));
  const [acting, setActing] = useState<string | null>(null);

  return (
    <Section title={t(locale, "admin.shops")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <SearchForm
        locale={locale}
        placeholder="admin.searchShops"
        onSearch={(q) => {
          setList({ state: "loading" });
          setSearchState((cur) => submitSearch(cur, q)); // the same query again refetches too (#437)
        }}
      />
      <ListBody list={list} empty="admin.noResults" locale={locale} onMore={loadMore} onRetry={retry} loadingMore={loadingMore} moreFailed={moreFailed}>
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
                  rowId={s.id}
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
                    onModerated();
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
  rowId,
  locale,
  cells,
  suspended,
  canAct,
  acting,
  onAct,
  onCancel,
  onConfirm,
}: {
  /** `data-row`, so "load more" can focus the first row it added (#510). */
  rowId: string;
  locale: Locale;
  cells: ReactNode;
  suspended: boolean;
  canAct: boolean;
  acting: boolean;
  onAct: () => void;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const back = useReturnFocus(acting, trigger);
  return (
    <>
      <tr data-row={rowId}>
        {cells}
        <td className={tdCls}>
          <Badge tone={suspended ? "danger" : "soft"}>{t(locale, suspended ? "admin.suspended" : "admin.active")}</Badge>
        </td>
        <td className={tdCls}>
          {canAct && (
            <Button ref={trigger} size="sm" variant={suspended ? "secondary" : "danger"} onClick={onAct}>
              {t(locale, suspended ? "admin.unsuspend" : "admin.suspend")}
            </Button>
          )}
        </td>
      </tr>
      {acting && (
        <tr>
          <td colSpan={4} className={tdCls}>
            <ReasonPrompt
              locale={locale}
              required
              onConfirm={(reason) => {
                back(); // takes effect only once the prompt closes (a failure keeps it open)
                return onConfirm(reason);
              }}
              onCancel={() => (back(), onCancel())}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Taken-down coffees ────────────────────────────────────────────────────

/** Coffees under a takedown, each with "Restore" (reason required) (#497). */
function TakenDownSection({ locale, onModerated, version }: { locale: Locale; onModerated: () => void; version: number }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    (offset: number) => request(ADMIN_TAKEN_DOWN_COFFEES, { limit: ADMIN_PAGE, offset }).then((r) => r.adminTakenDownCoffees),
    [request],
  );
  const { list, loadMore, loadingMore, moreFailed, update, retry } = useAdminList<TakenDownCoffee>(fetchPage, version);
  const [acting, setActing] = useState<string | null>(null);

  return (
    <Section title={t(locale, "admin.takenDown")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <p className="mb-4 text-sm text-muted">{t(locale, "admin.takenDownNote")}</p>
      <ListBody list={list} empty="admin.takenDownEmpty" locale={locale} onMore={loadMore} onRetry={retry} loadingMore={loadingMore} moreFailed={moreFailed}>
        {(nodes) => (
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>{t(locale, "admin.col.coffee")}</th>
                <th className={thCls}>{t(locale, "admin.col.shop")}</th>
                <th className={thCls}>{t(locale, "admin.col.date")}</th>
                <th className={thCls}>{t(locale, "admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((c) => (
                <TakenDownRow
                  key={c.id}
                  coffee={c}
                  locale={locale}
                  acting={acting === c.id}
                  onAct={() => setActing(c.id)}
                  onCancel={() => setActing(null)}
                  onConfirm={async (reason, row) => {
                    await request(RESTORE_COFFEE, { id: c.id, reason });
                    focusAfterRemoval(row); // the row goes: keep the admin's place (#405)
                    setActing(null);
                    update((p) => withoutRow(p, c.id));
                    onModerated();
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

function TakenDownRow({
  coffee: c,
  locale,
  acting,
  onAct,
  onCancel,
  onConfirm,
}: {
  coffee: TakenDownCoffee;
  locale: Locale;
  acting: boolean;
  onAct: () => void;
  onCancel: () => void;
  onConfirm: (reason: string, row: HTMLTableRowElement | null) => Promise<void>;
}) {
  const row = useRef<HTMLTableRowElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const back = useReturnFocus(acting, trigger);
  return (
    <>
      <tr ref={row} data-row={c.id}>
        {/* A taken-down coffee is a draft, so it has no public page to link to. */}
        <td className={`${tdCls} max-w-xs break-words text-ink`}>{c.name}</td>
        <td className={tdCls}>
          <Link href={`/shops/${encodeURIComponent(c.shop.slug)}`} target="_blank" className="text-ink underline-offset-4 hover:underline">
            {c.shop.name}
          </Link>
        </td>
        <td className={tdCls}>{c.takenDownAt ? date(c.takenDownAt) : "—"}</td>
        <td className={tdCls}>
          <div data-row-action>
            <Button ref={trigger} size="sm" variant="secondary" onClick={onAct}>
              {t(locale, "admin.restore")}
            </Button>
          </div>
        </td>
      </tr>
      {acting && (
        <tr>
          <td colSpan={4} className={tdCls}>
            <ReasonPrompt
              locale={locale}
              required
              onConfirm={(reason) => onConfirm(reason, row.current)}
              onCancel={() => (back(), onCancel())}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Audit log ─────────────────────────────────────────────────────────────

function AuditSection({ locale, version }: { locale: Locale; version: number }) {
  const { request } = useAuth();
  const fetchPage = useCallback(
    (offset: number) => request(AUDIT_LOG, { limit: ADMIN_PAGE, offset }).then((r) => r.auditLog),
    [request],
  );
  const { list, loadMore, loadingMore, moreFailed, retry } = useAdminList<AuditRow>(fetchPage, version);

  return (
    <Section title={t(locale, "admin.audit")} count={list.state === "ready" ? list.total : undefined} locale={locale}>
      <ListBody list={list} empty="admin.auditEmpty" locale={locale} onMore={loadMore} onRetry={retry} loadingMore={loadingMore} moreFailed={moreFailed}>
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
                  <td className={tdCls}>{date(e.createdAt)}</td>
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
