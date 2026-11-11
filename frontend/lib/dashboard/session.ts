// Pure helpers that keep a seller's typed work safe when the session ends or
// the connection hiccups (#228). No imports, so `node --test` loads it directly.

/**
 * What a dashboard form shows for the auth state. `locked`: the session ended
 * while this form was open, so the form stays mounted (values kept, inputs
 * disabled) under an inline "sign in again" panel instead of being replaced.
 */
export function sellerSessionView(
  status: "loading" | "authenticated" | "anonymous",
  hadSession: boolean,
): "loading" | "open" | "locked" | "login" {
  if (status === "authenticated") return "open";
  if (status === "anonymous") return hadSession ? "locked" : "login";
  return "loading";
}

/**
 * Whether clicking a link should first ask "leave without saving?". Only plain,
 * same-tab, same-origin navigations to another page qualify: modified clicks,
 * new tabs, downloads, other origins and in-page anchors leave the form alone.
 */
export function shouldConfirmLeave(
  href: string,
  current: string,
  opts: { modified?: boolean; target?: string | null; download?: boolean } = {},
): boolean {
  if (opts.modified || opts.download) return false;
  if (opts.target && opts.target !== "_self") return false;
  let to: URL;
  let from: URL;
  try {
    from = new URL(current);
    to = new URL(href, from);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}

/** One saved draft of the new-coffee form: its named fields plus option rows. */
export interface CoffeeDraft {
  fields: Record<string, string>;
  rows: { grind: string; weightG: string; priceTwd: string; stock: string }[];
}

/** sessionStorage key for a user's new-coffee draft (one per tab and user). */
export function draftKey(userId: string): string {
  return `mc-draft:new-coffee:${userId}`;
}

const DEFAULT_ROW = { grind: "WHOLE_BEAN", weightG: "200", priceTwd: "", stock: "0" };

/** True when the draft holds nothing the seller typed (blank fields, the one default option row). */
export function isEmptyDraft(d: CoffeeDraft): boolean {
  const blankFields = Object.values(d.fields).every((v) => v.trim() === "");
  const defaultRows =
    d.rows.length === 0 ||
    (d.rows.length === 1 &&
      (Object.keys(DEFAULT_ROW) as (keyof typeof DEFAULT_ROW)[]).every((k) => d.rows[0][k] === DEFAULT_ROW[k]));
  return blankFields && defaultRows;
}

/** A draft from a form's text entries (files are never kept) and its option rows. */
export function makeDraft(entries: Iterable<[string, unknown]>, rows: CoffeeDraft["rows"]): CoffeeDraft {
  const fields: Record<string, string> = {};
  for (const [k, v] of entries) if (typeof v === "string") fields[k] = v;
  return { fields, rows: rows.map((r) => ({ ...r })) };
}

/** Parses a stored draft; anything malformed or empty is null. */
export function parseDraft(raw: string | null): CoffeeDraft | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const { fields, rows } = v as Record<string, unknown>;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields) || !Array.isArray(rows)) return null;
  const f: Record<string, string> = {};
  for (const [k, x] of Object.entries(fields)) {
    if (typeof x !== "string") return null;
    f[k] = x;
  }
  const r: CoffeeDraft["rows"] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) return null;
    const { grind, weightG, priceTwd, stock } = row as Record<string, unknown>;
    if (![grind, weightG, priceTwd, stock].every((x) => typeof x === "string")) return null;
    r.push({ grind: grind as string, weightG: weightG as string, priceTwd: priceTwd as string, stock: stock as string });
  }
  const d = { fields: f, rows: r };
  return isEmptyDraft(d) ? null : d;
}
