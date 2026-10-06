import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, type Locale, negotiateLocale } from "@/i18n/config";
import { localeFromPathname, localizedPath } from "@/i18n/paths";
import { NEON_SESSION_COOKIE, getNeonAuth } from "@/server/staff-auth/neon-config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const STUDENT_COOKIES = ["__Host-mig_student", "mig_student"];

const isAdminPath = (pathname: string, locale: Locale) =>
  pathname === `/${locale}/admin` || pathname.startsWith(`/${locale}/admin/`);

const isProtectedPortalPath = (pathname: string, locale: Locale) =>
  (pathname === `/${locale}/portal` || pathname.startsWith(`/${locale}/portal/`)) &&
  !pathname.startsWith(`/${locale}/portal/login`);

/**
 * 1. Every page lives under a locale prefix (`/en/...`, `/ar/...`). Requests without one are
 *    redirected to the visitor's remembered or preferred language.
 * 2. Staff pages (`/<locale>/admin`) run Neon Auth's middleware first: it verifies and
 *    refreshes the session and redirects signed-out visitors to the localized sign-in page.
 * 3. Portal pages without a student session cookie go straight to the portal sign-in page.
 *
 * These are early, optimistic checks so protected content never starts rendering for a
 * signed-out visitor. Pages and Server Actions still verify everything on the server.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const current = localeFromPathname(pathname);

  if (!current) {
    const locale = negotiateLocale({
      cookie: remembered,
      acceptLanguage: request.headers.get("accept-language"),
    });
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(url);
  }

  let response: NextResponse;
  const neonAuth = getNeonAuth();
  if (isAdminPath(pathname, current) && neonAuth) {
    const expired = request.cookies.has(NEON_SESSION_COOKIE);
    const loginUrl = localizedPath(current, `/staff/login${expired ? "?reason=expired" : ""}`);
    response = await neonAuth.middleware({ loginUrl })(request);
  } else if (
    isProtectedPortalPath(pathname, current) &&
    !STUDENT_COOKIES.some((name) => request.cookies.has(name))
  ) {
    response = NextResponse.redirect(new URL(localizedPath(current, "/portal/login"), request.url));
  } else {
    response = NextResponse.next();
  }

  if (remembered !== current) {
    response.cookies.set(LOCALE_COOKIE, current, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension (icons, robots.txt, ...).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
