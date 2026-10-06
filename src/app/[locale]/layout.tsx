import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { getDirection, isLocale, locales } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { manrope, notoKufiArabic } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const name = locale === "ar" ? BRAND.nameArabic : BRAND.name;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: dictionaries[locale].meta.description,
    applicationName: BRAND.name,
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f3d2e",
  colorScheme: "light",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={`${manrope.variable} ${notoKufiArabic.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
