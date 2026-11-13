"use client";

import { useId, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Drawer } from "@/components/Drawer";
import { Button, Field, Textarea } from "@/components/ui";
import { rateLimitMessage } from "@/lib/errors";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  canReport,
  canSubmitReport,
  reportErrorKey,
  type ReportReason,
} from "@/lib/moderation";
import { REPORT } from "@/lib/moderationQueries";

const TITLE = { COMMENT: "report.titleComment", SHOP: "report.titleShop", COFFEE: "report.titleCoffee" } as const;

/**
 * A quiet "檢舉 / Report" action (#225) on a comment, a shop page or a coffee page, for
 * signed-in visitors other than the author / owner. It opens the shared
 * Drawer with a reason picker and an optional note.
 */
export function ReportButton({
  targetType,
  targetId,
  authorId,
  shopId,
  locale,
}: {
  targetType: "COMMENT" | "SHOP" | "COFFEE";
  targetId: string;
  /** The comment's author, who doesn't get the action. */
  authorId?: string;
  /** The shop being reported, so its owner doesn't get the action. */
  shopId?: string;
  locale: Locale;
}) {
  const { user, request } = useAuth();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  if (!canReport(user ? { id: user.id, shopId: user.shop?.id } : null, { authorId, shopId })) return null;

  const noteTooLong = [...note.trim()].length > REPORT_NOTE_MAX;
  const close = () => {
    setOpen(false);
    if (done) {
      setDone(false);
      setReason(null);
      setNote("");
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitReport(reason, note) || busy || !reason) return;
    setBusy(true);
    setError(null);
    try {
      const n = note.trim();
      await request(REPORT, { targetType, targetId, reason, ...(n ? { note: n } : {}) });
      setDone(true);
    } catch (err) {
      const e2 = toApiError(err);
      setError(e2.code === "RATE_LIMITED" ? rateLimitMessage(e2.retryAfter) : { key: reportErrorKey(e2.code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t(locale, "report.action")}
      </Button>
      {open && (
        <Drawer
          id={`report-${id}`}
          open={open}
          onClose={close}
          title={t(locale, TITLE[targetType])}
          closeLabel={t(locale, "report.close")}
        >
          {done ? (
            <p role="status" className="text-sm text-ink">
              {t(locale, "report.done")}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 text-sm">
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 font-semibold text-ink">{t(locale, "report.reasonLegend")}</legend>
                <div className="divide-y divide-line border-y border-line">
                  {REPORT_REASONS.map((r) => (
                    <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-ink">
                      <input
                        type="radio"
                        name={`report-reason-${id}`}
                        value={r}
                        checked={reason === r}
                        onChange={() => (setReason(r), setError(null))}
                        className="h-4 w-4 accent-black"
                      />
                      {t(locale, `report.reason.${r}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field
                id={`report-note-${id}`}
                label={t(locale, "report.note")}
                error={noteTooLong ? t(locale, "report.noteTooLong", { max: REPORT_NOTE_MAX }) : undefined}
              >
                {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />}
              </Field>
              {error && (
                <p role="alert" className="text-danger">
                  {t(locale, error.key, error.vars)}
                </p>
              )}
              <Button type="submit" pending={busy} disabled={!canSubmitReport(reason, note)}>
                {busy ? t(locale, "report.sending") : t(locale, "report.submit")}
              </Button>
            </form>
          )}
        </Drawer>
      )}
    </>
  );
}
