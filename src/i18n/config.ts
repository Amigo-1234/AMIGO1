export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie that remembers the visitor's chosen language. */
export const LOCALE_COOKIE = "mig_locale";

export type Direction = "ltr" | "rtl";

const directions: Record<Locale, Direction> = { en: "ltr", ar: "rtl" };

/** BCP 47 tags passed to `Intl`. Arabic keeps Western digits so IDs, scores and amounts read consistently. */
const intlLocales: Record<Locale, string> = { en: "en-NG", ar: "ar-u-nu-latn" };

/** Each language's name written in that language, for the language switcher. */
export const localeNames: Record<Locale, string> = { en: "English", ar: "العربية" };

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): Direction {
  return directions[locale];
}

export function getIntlLocale(locale: Locale): string {
  return intlLocales[locale];
}

/**
 * Pick a locale for a visitor whose URL has none: a valid remembered choice wins,
 * then the best `Accept-Language` match by quality, then the default.
 */
export function negotiateLocale({
  cookie,
  acceptLanguage,
}: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(cookie)) return cookie;
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isNaN(quality) ? 0 : quality,
        index,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { language } of ranked) {
    if (isLocale(language)) return language;
  }
  return defaultLocale;
}
