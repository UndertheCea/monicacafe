"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { useAuth } from "./AuthProvider";

/** Header login link, or the signed-in user's menu. */
export function AccountMenu({ locale }: { locale: Locale }) {
  const { status, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on navigation: adjust state while rendering (no effect, no extra pass).
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status === "loading") return <span className="inline-block h-7 w-14" aria-hidden />;

  if (!user) {
    const next = pathname && pathname !== "/login" && pathname !== "/register" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Link
        href={`/login${next}`}
        className="rounded-full bg-stone-900 px-3 py-1 text-sm font-semibold text-white hover:bg-stone-700"
      >
        {t(locale, "nav.login")}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(locale, "nav.account")}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[9rem] items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-sm hover:border-amber-500"
      >
        <span className="truncate">{user.displayName}</span>
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200">
          <Link role="menuitem" href="/dashboard" className="block px-4 py-2 text-sm hover:bg-stone-50">
            {t(locale, user.shop ? "nav.dashboard" : "nav.openShop")}
          </Link>
          <Link role="menuitem" href="/account" className="block px-4 py-2 text-sm hover:bg-stone-50">
            {t(locale, "nav.settings")}
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              router.refresh();
            }}
            className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-50"
          >
            {t(locale, "nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
