"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { copyName, duplicateCoffeeError } from "@/lib/dashboard/duplicateCoffee";
import type { DashWriteError } from "@/lib/dashboard/writeError";
import { DUPLICATE_COFFEE } from "@/lib/dashboard/queries";
import { toApiError } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { FormError } from "./ui";
import { Button } from "@/components/ui";

/** "Duplicate": copies the coffee into a new draft and opens its edit page. */
export function DuplicateCoffeeButton({ coffeeId, name, locale }: { coffeeId: string; name: string; locale: Locale }) {
  const { request } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DashWriteError | null>(null);

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const r = await request(DUPLICATE_COFFEE, { id: coffeeId, name: copyName(name, t(locale, "dash.copySuffix")) });
      router.push(`/dashboard/coffees/${r.duplicateCoffee.id}`);
    } catch (err) {
      const e = toApiError(err);
      setError(duplicateCoffeeError(e.code, e.retryAfter));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        pending={busy}
        onClick={() => void duplicate()}
        title={t(locale, "dash.duplicateHint")}
        variant="quiet" size="sm"
      >
        {t(locale, busy ? "dash.duplicating" : "dash.duplicate")}
      </Button>
      {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}
    </span>
  );
}
