import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { BrandMark } from "@/components/brand/brand-mark";
import { GeometricPattern } from "@/components/brand/geometric-pattern";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { ArrowBackIcon } from "@/components/icons";
import { BRAND } from "@/lib/brand";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { LanguageSwitcher } from "./language-switcher";
import { SkipLink } from "./skip-link";

/**
 * Sign-in screens: a quiet architectural panel (emerald, faint lattice) beside the form
 * on large screens; on phones the panel collapses into a short band above the form.
 */
export function AuthShell({
  locale,
  t,
  title,
  subtitle,
  children,
}: {
  locale: Locale;
  t: Dictionary;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkipLink label={t.common.skipToContent} />

      <aside className="relative overflow-hidden bg-brand-900 text-ivory">
        <div className="text-gold-300/15">
          <GeometricPattern />
        </div>
        <div className="relative flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:hidden">
          <Link href={localizedPath(locale)} className="focus-ring-on-dark rounded-md">
            <BrandLockup locale={locale} tone="light" />
          </Link>
          <LanguageSwitcher locale={locale} label={t.common.language} tone="light" />
        </div>
        <div className="relative hidden h-full flex-col items-center justify-center gap-6 px-10 text-center lg:flex">
          <BrandMark tone="light" className="size-20" />
          <div>
            <p lang="ar" className="text-4xl leading-normal font-semibold">
              {BRAND.nameArabic}
            </p>
            <p lang="en" className="mt-1 text-lg font-medium text-brand-100">
              {BRAND.name}
            </p>
          </div>
          <OrnamentDivider className="w-48" />
        </div>
      </aside>

      <main id="main" className="flex flex-1 flex-col">
        <div className="hidden justify-end px-8 pt-6 lg:flex">
          <LanguageSwitcher locale={locale} label={t.common.language} />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 lg:justify-center">
          <Link
            href={localizedPath(locale)}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-semibold text-brand-800 hover:text-brand-950"
          >
            <ArrowBackIcon className="size-4 rtl:-scale-x-100" />
            {t.common.backToHome}
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-brand-950">{title}</h1>
          <p className="mt-2 text-charcoal-700">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
