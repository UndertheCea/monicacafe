"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteCoffeeErrorKey } from "@/lib/dashboard/deleteCoffee";
import { DELETE_COFFEE } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { FormError } from "./ui";
import { Button } from "@/components/ui";

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
  const [confirming, setConfirming] = useState(false);
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
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <span className="inline-flex flex-col gap-1">
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          variant="quiet" size="sm"
        >
          {t(locale, "dash.delete")}
        </Button>
        {error && <FormError>{t(locale, error)}</FormError>}
      </span>
    );
  }
  return (
    <span role="group" aria-label={t(locale, "dash.deleteConfirm")} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-danger">{t(locale, "dash.deleteConfirm")}</span>
      <Button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        variant="danger" size="sm"
      >
        {t(locale, busy ? "dash.deleting" : "dash.deleteYes")}
      </Button>
      <Button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        variant="secondary" size="sm"
      >
        {t(locale, "dash.cancel")}
      </Button>
    </span>
  );
}
