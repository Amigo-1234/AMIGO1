import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { isLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/** The locale of the current request (from the `[locale]` root segment). Server Components only. */
export async function getLocale(): Promise<Locale> {
  const value = await rootLocale();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
