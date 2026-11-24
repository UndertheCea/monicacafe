"use client";

import { useId, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { MODERATION_REASON_MAX, adminErrorKey, moderationReasonProblem } from "@/lib/moderation";

/** A reason field with Confirm / Cancel, shown under the row being acted on. */
export function ReasonPrompt({
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
      const e2 = toApiError(err);
      setError({ key: adminErrorKey(e2.code, e2.field, reason.trim()) });
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
