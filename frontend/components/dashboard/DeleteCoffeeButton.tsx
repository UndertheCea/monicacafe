"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteCoffeeErrorKey } from "@/lib/dashboard/deleteCoffee";
import { DELETE_COFFEE } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { FormError } from "./ui";

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
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:text-red-700"
        >
          {t(locale, "dash.delete")}
        </button>
        {error && <FormError>{t(locale, error)}</FormError>}
      </span>
    );
  }
  return (
    <span role="group" aria-label={t(locale, "dash.deleteConfirm")} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-red-800">{t(locale, "dash.deleteConfirm")}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="rounded-full bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
      >
        {t(locale, busy ? "dash.deleting" : "dash.deleteYes")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:border-stone-500 disabled:opacity-50"
      >
        {t(locale, "dash.cancel")}
      </button>
    </span>
  );
}
