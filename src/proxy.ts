import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@/i18n/config";
import { localeFromPathname } from "@/i18n/paths";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Every page lives under a locale prefix (`/en/...`, `/ar/...`).
 * Requests without one are redirected to the visitor's remembered or preferred
 * language; requests with one record it as the remembered choice.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const current = localeFromPathname(pathname);

  if (current) {
    const response = NextResponse.next();
    if (remembered !== current) {
      response.cookies.set(LOCALE_COOKIE, current, {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        sameSite: "lax",
      });
    }
    return response;
  }

  const locale = negotiateLocale({
    cookie: remembered,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension (icons, robots.txt, ...).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
