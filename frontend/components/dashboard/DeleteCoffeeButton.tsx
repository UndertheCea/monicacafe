"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteCoffeeErrorKey } from "@/lib/dashboard/deleteCoffee";
import { DELETE_COFFEE } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { focusAfterRemoval } from "@/components/focusAfterRemoval";
import { FormError } from "./ui";
import { ConfirmButton } from "@/components/ui";

/** "Delete" for a draft coffee, with an inline confirm step. */
export function DeleteCoffeeButton({
  coffeeId,
  locale,
  onDeleted,
}: {
  coffeeId: string;
  locale: Locale;
  onDeleted: () => void;
}) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request(DELETE_COFFEE, { id: coffeeId });
      focusAfterRemoval(wrap.current?.closest("[data-row]")); // the row goes: keep the seller's place (#488)
      onDeleted();
    } catch (err) {
      const e = toApiError(err);
      setError(deleteCoffeeErrorKey(e.code, e.field));
      setBusy(false);
    }
  }

  return (
    <span ref={wrap} className="inline-flex flex-col gap-1">
      <ConfirmButton
        question={t(locale, "dash.deleteConfirm")}
        confirmLabel={t(locale, busy ? "dash.deleting" : "dash.deleteYes")}
        cancelLabel={t(locale, "dash.cancel")}
        busy={busy}
        onConfirm={() => void remove()}
      >
        {t(locale, "dash.delete")}
      </ConfirmButton>
      {error && <FormError>{t(locale, error)}</FormError>}
    </span>
  );
}
