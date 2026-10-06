import type { Metadata } from "next";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { studentSignOutAction } from "@/server/student-auth/actions";
import { requireStudent } from "@/server/student-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].portal.title } : {};
}

/** Minimal authenticated shell proving student sessions work; the dashboard comes in Phase 7. */
export default async function PortalPage({ searchParams }: PageProps<"/[locale]/portal">) {
  const { locale, t } = await getDictionary();
  const { student } = await requireStudent(locale);
  const { pin } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t.common.skipToContent} />
      <SiteHeader
        locale={locale}
        t={t}
        actions={
          <SignOutForm
            action={studentSignOutAction}
            locale={locale}
            label={t.auth.signOut}
            pendingLabel={t.auth.signingOut}
          />
        }
      />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {pin === "saved" && <Notice className="mb-6">{t.auth.setPin.saved}</Notice>}
        <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">
          {t.portal.title}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">
          {interpolate(t.portal.welcome, { name: student.fullName })}
        </h1>
        <OrnamentDivider className="mt-6 max-w-40" />
        <Card className="mt-8 p-5">
          <dl className="grid gap-1">
            <dt className="text-sm text-stone-600">{t.portal.studentId}</dt>
            <dd
              dir="ltr"
              className="text-start text-lg font-semibold text-charcoal-900 rtl:text-end"
            >
              {student.publicId}
            </dd>
          </dl>
        </Card>
        <p className="mt-6 text-charcoal-700">{t.portal.comingSoon}</p>
      </main>
    </div>
  );
}
