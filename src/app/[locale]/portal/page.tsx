import type { Metadata } from "next";
import Link from "next/link";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { ChevronForwardIcon } from "@/components/icons";
import { PortalFrame } from "@/components/layout/portal-frame";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { publishedSheetsFor } from "@/server/results/read";
import { requireStudent } from "@/server/student-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].portal.title } : {};
}

/** The student's home: identity and their published results. */
export default async function PortalPage({ searchParams }: PageProps<"/[locale]/portal">) {
  const { locale, t } = await getDictionary();
  const session = await requireStudent(locale);
  const { student } = session;
  const { pin } = await searchParams;
  // Only this student's finalized sheets in published classes; the ID comes from the session.
  const sheets = await publishedSheetsFor(getDb(), session);
  const ar = locale === "ar";

  return (
    <PortalFrame locale={locale} t={t}>
      {pin === "saved" && <Notice className="mb-6">{t.auth.setPin.saved}</Notice>}
      <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">
        {t.portal.title}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">
        <span className="user-text">
          {interpolate(t.portal.welcome, { name: student.fullName })}
        </span>
      </h1>
      <OrnamentDivider className="mt-6 max-w-40" />
      <Card className="mt-8 p-5">
        <dl className="grid gap-1">
          <dt className="text-sm text-stone-600">{t.portal.studentId}</dt>
          <dd dir="ltr" className="text-start text-lg font-semibold text-charcoal-900 rtl:text-end">
            {student.publicId}
          </dd>
        </dl>
      </Card>

      <section aria-labelledby="results-title" className="mt-8">
        <h2 id="results-title" className="text-xl font-semibold text-brand-950">
          {t.portal.results}
        </h2>
        {sheets.length === 0 ? (
          <p className="mt-3 text-charcoal-700">{t.portal.noResults}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {sheets.map((sheet) => (
              <li key={sheet.sheetId}>
                <Link
                  href={localizedPath(locale, `/portal/results/${sheet.sheetId}`)}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-300 hover:bg-sand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-charcoal-900">
                      <span dir="ltr">{sheet.sessionLabel}</span> ·{" "}
                      {ar ? sheet.termNameAr : sheet.termNameEn}
                    </span>
                    <span className="block text-sm text-stone-600">
                      {ar ? sheet.levelNameAr : sheet.levelNameEn}
                      {sheet.summary.average !== null &&
                        ` · ${t.sheet.average} ${formatNumber(sheet.summary.average, locale)}`}
                    </span>
                  </span>
                  <span className="sr-only">{t.portal.viewResults}</span>
                  <ChevronForwardIcon className="size-5 shrink-0 text-stone-400 rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-8 text-charcoal-700">{t.portal.comingSoon}</p>
    </PortalFrame>
  );
}
