import { getIntlLocale, type Locale } from "./config";

/** Replace `{name}` placeholders. Unknown placeholders are left visible so mistakes are noticed. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(value);
}

/** Naira amounts. School fees are whole Naira, so no kobo are shown by default. */
export function formatNaira(amount: number, locale: Locale, { kobo = false } = {}): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: kobo ? 2 : 0,
    maximumFractionDigits: kobo ? 2 : 0,
  }).format(amount);
}

export function formatDate(
  date: Date,
  locale: Locale,
  style: Intl.DateTimeFormatOptions["dateStyle"] = "medium",
): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: style,
    timeZone: "Africa/Lagos",
  }).format(date);
}

/** A calendar date stored as YYYY-MM-DD (e.g. a date of birth), without time-zone drift. */
export function formatDay(value: string | null | undefined, locale: Locale): string | null {
  return value ? formatDate(new Date(`${value}T12:00:00Z`), locale) : null;
}
