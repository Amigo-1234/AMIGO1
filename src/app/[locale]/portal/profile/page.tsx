import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailList } from "@/components/admin/page-parts";
import { PortalFrame } from "@/components/layout/portal-frame";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatDay } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { portalProfile } from "@/server/portal/queries";
import { requireStudent } from "@/server/student-auth/current";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/profile">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].portal.profileTitle } : {};
}

/** The signed-in student's own records, read-only. */
export default async function PortalProfilePage() {
  const { locale, t } = await getDictionary();
  const session = await requireStudent(locale);
  const profile = await portalProfile(getDb(), session);
  if (!profile) notFound();
  const { student, identifiers, history, guardians } = profile;
  const P = t.portal;
  const ar = locale === "ar";
  const day = (value: string | null) => formatDay(value, locale);
  const earlier = identifiers.filter((i) => !i.isPrimary).map((i) => i.value);

  const card = (id: string, title: string, children: React.ReactNode) => (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby={id}>
        <h2 id={id} className="mb-4 text-base font-semibold text-brand-950">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );

  return (
    <PortalFrame locale={locale} t={t}>
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">{P.profileTitle}</h1>
      <Notice tone="info" className="mt-4">
        {P.readOnly}
      </Notice>
      <div className="mt-6 flex flex-col gap-4">
        {card(
          "identity",
          P.identity,
          <DetailList
            emptyLabel={P.notRecorded}
            rows={[
              { label: P.name, value: student.fullName },
              { label: P.studentId, value: student.publicId, ltr: true },
              ...(earlier.length
                ? [{ label: P.otherIds, value: earlier.join(", "), ltr: true }]
                : []),
              { label: P.status, value: t.admin.studentStatus[student.status] },
            ]}
          />,
        )}
        {card(
          "personal",
          P.personal,
          <DetailList
            emptyLabel={P.notRecorded}
            rows={[
              { label: P.gender, value: student.gender ? t.admin.gender[student.gender] : null },
              { label: P.dateOfBirth, value: day(student.dateOfBirth) },
              { label: P.admittedOn, value: day(student.admittedOn) },
              { label: P.phone, value: student.phone, ltr: true },
              { label: P.address, value: student.address },
            ]}
          />,
        )}
        {card(
          "guardians",
          P.guardians,
          guardians.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {guardians.map((g) => (
                <li key={g.id} className="rounded-md border border-stone-200 p-4">
                  <p className="user-text font-semibold text-charcoal-900">{g.fullName}</p>
                  {g.relationship && (
                    <p className="user-text text-sm text-charcoal-700">{g.relationship}</p>
                  )}
                  {g.isPrimaryContact && (
                    <Badge tone="accent" className="mt-2">
                      {P.primaryContact}
                    </Badge>
                  )}
                  {g.phone && (
                    <p dir="ltr" className="mt-2 text-start text-sm text-charcoal-900 rtl:text-end">
                      <a href={`tel:${g.phone}`} className="hover:underline">
                        {g.phone}
                      </a>
                    </p>
                  )}
                  {g.email && (
                    <p
                      dir="ltr"
                      className="truncate text-start text-sm text-charcoal-900 rtl:text-end"
                    >
                      {g.email}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-charcoal-700">{P.noGuardians}</p>
          ),
        )}
        {card(
          "history",
          P.history,
          history.length ? (
            <ul className="divide-y divide-stone-200">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <span>
                    <span dir="ltr" className="font-semibold text-charcoal-900 tabular-nums">
                      {row.sessionLabel}
                    </span>
                    <span className="text-charcoal-700">
                      {" · "}
                      {ar ? row.levelNameAr : row.levelNameEn}
                    </span>
                    {(row.enrolledOn || row.endedOn) && (
                      <span className="block text-sm text-stone-600">
                        {[day(row.enrolledOn), day(row.endedOn)].filter(Boolean).join(" – ")}
                      </span>
                    )}
                  </span>
                  <Badge tone={row.status === "active" ? "success" : "neutral"}>
                    {t.admin.enrollmentStatus[row.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-charcoal-700">{P.noHistory}</p>
          ),
        )}
      </div>
    </PortalFrame>
  );
}
