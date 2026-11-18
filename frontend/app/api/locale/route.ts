// POST /api/locale: the no-JavaScript language switch (#367). Sets the `locale`
// cookie like LanguageToggle's script path does, then 303s back to a same-site
// path. Cross-site posts are refused with the same check as the auth handlers.
import { NextResponse, type NextRequest } from "next/server";
import { originAllowed } from "@/lib/auth/cookie";
import { LOCALE_COOKIE } from "@/lib/i18n/dict";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_PATH, parseLocaleForm } from "@/lib/i18n/localeForm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const allowed = originAllowed({
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    siteUrl: process.env.SITE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  if (!allowed) return new NextResponse("cross-site request rejected", { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  const parsed = parseLocaleForm(form.get("locale"), form.get("next"));
  if (!parsed) return new NextResponse("unknown locale", { status: 400 });

  // A relative Location: behind nginx the request URL's host is the internal one.
  const res = new NextResponse(null, { status: 303, headers: { Location: parsed.next, "Cache-Control": "no-store" } });
  res.cookies.set(LOCALE_COOKIE, parsed.locale, {
    path: LOCALE_COOKIE_PATH,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return res;
}
