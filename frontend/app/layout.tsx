import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MONI CAFE — 台灣精品咖啡市集",
    template: "%s | MONI CAFE",
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
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans`}>
        {/* First focusable element: lets keyboard / screen-reader users jump past the header. */}
        <a
          href="#main"
          className="sr-only rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000]"
        >
          {t(locale, "a11y.skipToMain")}
        </a>
        <AuthProvider>
          <SiteHeader locale={locale} />
          {/* The page's only main landmark (pages render a div); tabIndex lets the skip link move focus here. */}
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter locale={locale} />
        </AuthProvider>
      </body>
    </html>
  );
}
