"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteCoffeeErrorKey } from "@/lib/dashboard/deleteCoffee";
import { DELETE_COFFEE } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
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
  const [error, setError] = useState<MessageKey | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request(DELETE_COFFEE, { id: coffeeId });
      onDeleted();
    } catch (err) {
      setError(deleteCoffeeErrorKey(toApiError(err).code));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
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
