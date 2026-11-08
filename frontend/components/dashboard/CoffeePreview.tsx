"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CoffeeDetailView } from "@/components/coffees/CoffeeDetailView";
import { COFFEE, isUUID, type CoffeeDetail } from "@/lib/api";
import { canManageCoffee, previewBannerKey } from "@/lib/dashboard/preview";
import { t, type Locale } from "@/lib/i18n/dict";
import { LoginNeeded, Notice } from "./ui";

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; coffee: CoffeeDetail };

/**
 * Client-rendered preview of a coffee page with the seller's token (#8 default:
 * drafts stay dashboard-only, so public /coffees/[id] keeps 404ing for drafts).
 */
export function CoffeePreview({ coffeeId, locale }: { coffeeId: string; locale: Locale }) {
  const { status, user, request } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!isUUID(coffeeId)) return; // rendered as "missing" below
    let live = true;
    request(COFFEE, { id: coffeeId })
      .then((r) => live && setLoad(r.coffee ? { state: "ready", coffee: r.coffee } : { state: "missing" }))
      .catch(() => live && setLoad({ state: "error" }));
    return () => {
      live = false;
    };
  }, [status, coffeeId, request]);

  const next = `/dashboard/coffees/${coffeeId}/preview`;
  if (status === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (status === "anonymous") return <LoginNeeded locale={locale} next={next} />;
  if (!isUUID(coffeeId)) return <Notice>{t(locale, "cf.notYours")}</Notice>;
  if (load.state === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (load.state === "error") return <Notice>{t(locale, "error.title")}</Notice>;
  if (load.state === "missing" || !canManageCoffee(load.coffee.shop.id, user)) {
    return <Notice>{t(locale, "cf.notYours")}</Notice>;
  }

  const coffee = load.coffee;
  return (
    <>
      <div
        role="status"
        className={
          coffee.isPublished
            ? "mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-ink ring-1 ring-neutral-300"
            : "mt-4 rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink ring-1 ring-neutral-300"
        }
      >
        {t(locale, previewBannerKey(coffee.isPublished))}{" "}
        {coffee.isPublished && (
          <Link href={`/coffees/${coffee.id}`} className="underline">
            {t(locale, "dash.view")}
          </Link>
        )}
      </div>
      <CoffeeDetailView coffee={coffee} locale={locale} />
    </>
  );
}
