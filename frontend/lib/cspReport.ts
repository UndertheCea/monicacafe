// Summarise a CSP violation report for one log line. No imports.

export const MAX_REPORT_BYTES = 8 * 1024;

export const REPORT_CONTENT_TYPES = ["application/csp-report", "application/reports+json"];

export function isReportContentType(ct: string | null): boolean {
  const base = (ct ?? "").split(";")[0].trim().toLowerCase();
  return REPORT_CONTENT_TYPES.includes(base);
}

type Summary = { type: string; documentURI?: string; violatedDirective?: string; blockedURI?: string };

const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : undefined);

function summarise(r: unknown): Summary | null {
  if (typeof r !== "object" || r === null) return null;
  const o = r as Record<string, unknown>;
  // Reporting API: { type: "csp-violation", url, body: { documentURL, effectiveDirective, blockedURL } }.
  if (typeof o.body === "object" && o.body !== null) {
    const b = o.body as Record<string, unknown>;
    return {
      type: s(o.type) ?? "csp-violation",
      documentURI: s(b.documentURL) ?? s(o.url),
      violatedDirective: s(b.effectiveDirective) ?? s(b.violatedDirective),
      blockedURI: s(b.blockedURL),
    };
  }
  // Legacy report-uri: { "csp-report": { "document-uri", "violated-directive", "blocked-uri" } }.
  const legacy = o["csp-report"];
  if (typeof legacy === "object" && legacy !== null) {
    const b = legacy as Record<string, unknown>;
    return {
      type: "csp-violation",
      documentURI: s(b["document-uri"]),
      violatedDirective: s(b["effective-directive"]) ?? s(b["violated-directive"]),
      blockedURI: s(b["blocked-uri"]),
    };
  }
  return null;
}

/** Compact summaries of every report in a body (one object or an array); [] when unparseable. */
export function summariseReports(raw: string): Summary[] {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  return (Array.isArray(v) ? v.slice(0, 20) : [v]).map(summarise).filter((x): x is Summary => x !== null);
}
