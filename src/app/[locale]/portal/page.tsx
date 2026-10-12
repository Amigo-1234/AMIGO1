import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { PortalFrame } from "@/components/layout/portal-frame";
import { SheetCard } from "@/components/portal/sheet-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { portalProfile, portalResults } from "@/server/portal/queries";
import { requireStudent } from "@/server/student-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].portal.title } : {};
}

/** The student's home: who and where they are, their latest published result, history. */
export default async function PortalPage({ searchParams }: PageProps<"/[locale]/portal">) {
  const { locale, t } = await getDictionary();
  const session = await requireStudent(locale);
  const { pin } = await searchParams;
  const db = getDb();
  // Both scoped to the student in the verified session.
  const [profile, sheets] = await Promise.all([
    portalProfile(db, session),
    portalResults(db, session),
  ]);
  if (!profile) notFound();
  const { student, current, currentTerm, history } = profile;
  const ar = locale === "ar";
  const P = t.portal;
  const levelName = (row: { levelNameEn: string; levelNameAr: string }) =>
    ar ? row.levelNameAr : row.levelNameEn;
  const linkClass =
    "inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 hover:text-brand-950 hover:underline";

  return (
    <PortalFrame locale={locale} t={t}>
      {pin === "saved" && <Notice className="mb-6">{t.auth.setPin.saved}</Notice>}
      <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">{P.title}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">
        <span className="user-text">{interpolate(P.welcome, { name: student.fullName })}</span>
      </h1>
      <p className="mt-1 text-charcoal-700">
        {P.studentId}:{" "}
        <span dir="ltr" className="font-semibold text-charcoal-900 tabular-nums">
          {student.publicId}
        </span>
      </p>
      <OrnamentDivider className="mt-6 max-w-40" />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <section aria-labelledby="current-title">
            <h2 id="current-title" className="text-sm font-semibold text-stone-600">
              {P.currentClass}
            </h2>
            {current ? (
              <>
                <p className="mt-1 text-2xl font-semibold text-brand-950">
                  {levelName(current)}{" "}
                  <span dir="ltr" className="text-base font-normal text-stone-600">
                    ({current.levelCode})
                  </span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-stone-600">{P.session}</dt>
                    <dd
                      dir="ltr"
                      className="text-start font-semibold text-charcoal-900 rtl:text-end"
                    >
                      {current.sessionLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-600">{P.term}</dt>
                    <dd className="font-semibold text-charcoal-900">
                      {currentTerm ? (ar ? currentTerm.nameAr : currentTerm.nameEn) : P.noTerm}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-600">{P.enrollment}</dt>
                    <dd>
                      <Badge tone="success">{t.admin.enrollmentStatus[current.status]}</Badge>
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-2 text-charcoal-700">{P.notEnrolled}</p>
            )}
          </section>
        </Card>

        <Card className="p-5">
          <section aria-labelledby="latest-title">
            <h2 id="latest-title" className="mb-3 text-sm font-semibold text-stone-600">
              {P.latestResult}
            </h2>
            {sheets[0] ? (
              <>
                <SheetCard locale={locale} t={t} sheet={sheets[0]} />
                <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
                  {interpolate(P.resultsCount, { count: formatNumber(sheets.length, locale) })}
                  <Link href={localizedPath(locale, "/portal/results")} className={linkClass}>
                    {P.allResults}
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-charcoal-700">{P.noResults}</p>
            )}
          </section>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <section aria-labelledby="history-title">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="history-title" className="text-base font-semibold text-brand-950">
              {P.history}
            </h2>
            <Link href={localizedPath(locale, "/portal/profile")} className={linkClass}>
              {P.profileTitle}
            </Link>
          </div>
          {history.length ? (
            <ul className="divide-y divide-stone-200">
              {history.slice(0, 4).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <span dir="ltr" className="font-semibold text-charcoal-900 tabular-nums">
                      {row.sessionLabel}
                    </span>
                    <span className="text-charcoal-700"> · {levelName(row)}</span>
                  </span>
                  <Badge tone={row.status === "active" ? "success" : "neutral"}>
                    {t.admin.enrollmentStatus[row.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-charcoal-700">{P.noHistory}</p>
          )}
        </section>
      </Card>
      <p className="mt-8 text-sm text-stone-600">{P.comingSoon}</p>
    </PortalFrame>
  );
}
