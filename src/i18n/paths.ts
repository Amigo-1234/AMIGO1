import { isLocale, type Locale } from "./config";

/** The locale prefix of a pathname, if it has one (`/ar/portal` → `ar`). */
export function localeFromPathname(pathname: string): Locale | undefined {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : undefined;
}

/** Build an in-app href for a locale: `localizedPath("ar", "/portal/login")` → `/ar/portal/login`. */
export function localizedPath(locale: Locale, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

/** The same page in another language: `/en/staff/login` → `/ar/staff/login`. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const current = localeFromPathname(pathname);
  const rest = current ? pathname.slice(current.length + 1) : pathname;
  return localizedPath(target, rest || "/");
}
