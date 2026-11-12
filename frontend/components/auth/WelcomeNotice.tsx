"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { takeWelcome } from "@/lib/welcome";

/**
 * A one-time "Welcome, name" line after registering. AuthForm leaves the name in
 * sessionStorage; this reads and clears it after the redirect lands, shows it as
 * a polite status for a few seconds, and renders it as text (never HTML).
 */
export function WelcomeNotice({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/register" || pathname === "/login") return; // still on the form
    const id = window.setTimeout(() => {
      const n = takeWelcome(window.sessionStorage);
      if (n) setName(n);
    }, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    if (!name) return;
    const id = window.setTimeout(() => setName(null), 8000);
    return () => window.clearTimeout(id);
  }, [name]);

  return (
    <div role="status" aria-live="polite">
      {name && (
        <p className="border-b border-line bg-paper px-4 py-2 text-center text-sm text-ink">
          {t(locale, "auth.welcome", { name })}
        </p>
      )}
    </div>
  );
}
