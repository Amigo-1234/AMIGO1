import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { GeometricPattern } from "@/components/brand/geometric-pattern";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { PointedArch } from "@/components/brand/pointed-arch";
import { ArrowForwardIcon, StaffIcon, StudentIcon } from "@/components/icons";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";

export default async function LandingPage() {
  const { locale, t } = await getDictionary();
  const primaryName = locale === "ar" ? BRAND.nameArabic : BRAND.name;
  const secondaryName = locale === "ar" ? BRAND.name : BRAND.nameArabic;

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t.common.skipToContent} />
      <SiteHeader locale={locale} t={t} />

      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        {/* Atmosphere: a faint lattice fading out toward the content. */}
        <div className="absolute inset-x-0 top-0 h-72 text-gold-500/20 [mask-image:linear-gradient(to_bottom,black,transparent)]">
          <GeometricPattern />
        </div>

        <section
          aria-labelledby="landing-title"
          className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-20"
        >
          <div className="relative grid h-44 w-36 place-items-center sm:h-52 sm:w-40">
            <PointedArch className="absolute inset-0 size-full text-gold-500/70" />
            <BrandMark className="mt-10 size-16 sm:size-20" />
          </div>

          <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">
            {t.landing.eyebrow}
          </p>
          <h1
            id="landing-title"
            className="mt-3 text-4xl font-semibold tracking-tight text-brand-950 sm:text-5xl"
          >
            {primaryName}
          </h1>
          <p
            lang={locale === "ar" ? "en" : "ar"}
            className={cn(
              "mt-2 text-brand-800",
              locale === "ar" ? "text-lg font-medium" : "text-2xl font-semibold sm:text-3xl",
            )}
          >
            {secondaryName}
          </p>

          <OrnamentDivider className="mt-8 w-full max-w-xs" />

          <p className="mt-6 max-w-xl text-base text-charcoal-700 sm:text-lg">{t.landing.intro}</p>

          <nav aria-label={t.landing.actionsLabel} className="mt-10 w-full">
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <li>
                <EntryLink
                  href={localizedPath(locale, "/portal/login")}
                  title={t.landing.studentPortal.title}
                  description={t.landing.studentPortal.description}
                  icon={<StudentIcon className="size-6" />}
                  emphasis
                />
              </li>
              <li>
                <EntryLink
                  href={localizedPath(locale, "/staff/login")}
                  title={t.landing.staffLogin.title}
                  description={t.landing.staffLogin.description}
                  icon={<StaffIcon className="size-6" />}
                />
              </li>
            </ul>
          </nav>
        </section>
      </main>

      <SiteFooter t={t} />
    </div>
  );
}

function EntryLink({
  href,
  title,
  description,
  icon,
  emphasis = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full items-start gap-4 rounded-lg border p-5 text-start transition-colors",
        emphasis
          ? "focus-ring-on-dark border-brand-900 bg-brand-900 text-ivory hover:bg-brand-950"
          : "border-stone-300 bg-white text-charcoal-900 hover:border-brand-700 hover:bg-brand-50/40",
      )}
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-md border",
          emphasis ? "border-gold-500/50 text-gold-300" : "border-stone-200 text-brand-800",
        )}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-base font-semibold">
          {title}
          <ArrowForwardIcon className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </span>
        <span className={cn("text-sm", emphasis ? "text-brand-100" : "text-stone-600")}>
          {description}
        </span>
      </span>
    </Link>
  );
}
