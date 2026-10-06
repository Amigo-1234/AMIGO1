import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { BRAND } from "@/lib/brand";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <header className="border-b border-stone-200/80 bg-ivory/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href={localizedPath(locale)}
          aria-label={`${locale === "ar" ? BRAND.nameArabic : BRAND.name} — ${t.common.home}`}
          className="rounded-md"
        >
          <BrandLockup locale={locale} />
        </Link>
        <LanguageSwitcher locale={locale} label={t.common.language} />
      </div>
    </header>
  );
}
