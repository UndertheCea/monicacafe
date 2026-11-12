import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { pageTitle } from "@/lib/brand";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { buttonClass } from "@/lib/ui";

// Body text uses the system stack (Tailwind's font-sans); Geist / Geist Mono were loaded but never mapped, so
// they were dropped in #234. The only web font is the wordmark's.
// The wordmark's heavy italic grotesque (#110); self-hosted by next/font, so the CSP needs no font host.
const wordmarkFont = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["800"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: {
    default: pageTitle(),
    template: pageTitle("%s"),
  },
  description: "探索台灣烘豆師的精品咖啡 · Discover specialty coffee from Taiwan's roasters.",
  keywords: ["精品咖啡", "咖啡豆", "台灣烘豆", "specialty coffee", "Taiwan roasters"],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body className={`${wordmarkFont.variable} flex min-h-screen flex-col font-sans`}>
        {/* First focusable element: lets keyboard / screen-reader users jump past the header. */}
        <a
          href="#main"
          className={buttonClass({ className: "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000]" })}
        >
          {t(locale, "a11y.skipToMain")}
        </a>
        <AuthProvider>
          <SiteHeader locale={locale} />
          {/* The page's only main landmark (pages render a div); tabIndex lets the skip link move focus here. */}
          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} />
        </AuthProvider>
      </body>
    </html>
  );
}
