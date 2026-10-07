import type { Metadata } from "next";
import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  Section,
  Stat,
  StudentStatusBadge,
} from "@/components/admin/page-parts";
import { PlusIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatDate, formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { getDashboard } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaff } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.dashboard.title } : {};
}

/** Dashboard built from live database counts only; nothing is estimated or sample data. */
export default async function DashboardPage({ searchParams }: PageProps<"/[locale]/admin">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  const { denied } = await searchParams;
  const d = t.admin.dashboard;
  const href = (path: string) => localizedPath(locale, path);
  const canRead = hasPermission(access, "students.read");
  const canCreate = hasPermission(access, "students.create");
  const canManageSessions = hasPermission(access, "sessions.manage");
  const num = (value: number) => formatNumber(value, locale);

  const header = (
    <PageHeader
      eyebrow={d.title}
      title={interpolate(d.greeting, { name: access.fullName })}
      actions={
        canCreate ? (
          <ButtonLink href={href("/admin/students/new")}>
            <PlusIcon className="size-4" />
            {d.register}
          </ButtonLink>
        ) : undefined
      }
    />
  );
  const deniedNotice = denied ? (
    <p
      role="status"
      className="mb-6 rounded-md border-s-4 border-gold-500 bg-warning-50 px-4 py-3 text-warning-700"
    >
      {t.admin.denied}
    </p>
  ) : null;

  if (!canRead) {
    return (
      <>
        {header}
        {deniedNotice}
      </>
    );
  }

  const data = await getDashboard(getDb());
  const other =
    (data.byStatus.suspended ?? 0) + (data.byStatus.withdrawn ?? 0) + (data.byStatus.archived ?? 0);
  const maxLevel = Math.max(1, ...data.byLevel.map((l) => l.count));
  const termName = data.currentTerm
    ? locale === "ar"
      ? data.currentTerm.nameAr
      : data.currentTerm.nameEn
    : null;

  return (
    <>
      {header}
      {deniedNotice}

      {!data.session && (
        <div className="mb-6">
          <EmptyState
            title={d.noSession}
            body={d.noSessionHint}
            action={
              canManageSessions ? (
                <ButtonLink href={href("/admin/academics")}>{d.createSession}</ButtonLink>
              ) : undefined
            }
          />
        </div>
      )}

      <h2 className="sr-only">{d.overview}</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat tone="brand" label={d.totalStudents} value={num(data.total)} />
        <Stat label={d.activeStudents} value={num(data.byStatus.active ?? 0)} />
        <Stat label={d.graduatedStudents} value={num(data.byStatus.graduated ?? 0)} />
        <Stat label={d.otherStudents} value={num(other)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-2"
          title={data.session?.status === "planned" ? d.upcomingSession : d.currentSession}
        >
          {data.session ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={href(`/admin/academics/sessions/${data.session.id}`)}
                  dir="ltr"
                  className="text-2xl font-semibold text-brand-900 tabular-nums hover:underline"
                >
                  {data.session.label}
                </Link>
                <Badge tone={data.session.status === "active" ? "success" : "neutral"}>
                  {t.admin.sessionStatus[data.session.status]}
                </Badge>
              </div>
              <dl className="grid gap-3">
                <div>
                  <dt className="text-sm text-stone-600">{d.currentTerm}</dt>
                  <dd className="font-semibold text-charcoal-900">{termName ?? d.noTerm}</dd>
                </div>
                <div>
                  <dt className="text-sm text-stone-600">{d.enrolled}</dt>
                  <dd className="text-2xl font-semibold text-brand-950 tabular-nums">
                    {num(data.enrolled)}
                  </dd>
                </div>
              </dl>
              {data.notEnrolled > 0 && (
                <p className="text-sm text-warning-700">
                  {interpolate(d.notEnrolled, { count: num(data.notEnrolled) })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-charcoal-700">{d.noSession}</p>
          )}
        </Section>

        <Section
          className="lg:col-span-3"
          title={d.byLevel}
          actions={
            data.session ? (
              <span dir="ltr" className="text-sm text-stone-600 tabular-nums">
                {data.session.label}
              </span>
            ) : undefined
          }
        >
          {/* One series, three bars: each value is written next to its bar (no legend needed). */}
          <ul className="flex flex-col gap-4">
            {data.byLevel.map((level) => (
              <li key={level.id}>
                <Link
                  href={href(`/admin/students?level=${level.id}`)}
                  className="group block rounded-md focus-visible:outline-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-charcoal-900 group-hover:underline">
                      {locale === "ar" ? level.nameAr : level.nameEn}{" "}
                      <span className="text-sm font-normal text-stone-600">({level.code})</span>
                    </span>
                    <span className="text-sm font-semibold text-charcoal-900 tabular-nums">
                      {interpolate(d.students, { count: num(level.count) })}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-xs bg-stone-100" aria-hidden="true">
                    <div
                      className="h-2 rounded-xs bg-brand-700"
                      style={{
                        width: `${(level.count / maxLevel) * 100}%`,
                        minWidth: level.count ? "0.5rem" : 0,
                      }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-4">
        <Section
          title={d.recent}
          actions={
            data.total > 0 ? (
              <Link
                href={href("/admin/students")}
                className="text-sm font-semibold text-brand-800 hover:underline"
              >
                {d.browse}
              </Link>
            ) : undefined
          }
        >
          {data.recent.length ? (
            <ul className="divide-y divide-stone-200">
              {data.recent.map((student) => (
                <li key={student.id}>
                  <Link
                    href={href(`/admin/students/${student.id}`)}
                    className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 hover:bg-sand-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-charcoal-900">
                        {student.fullName}
                      </span>
                      <span
                        dir="ltr"
                        className="block text-start text-sm text-stone-600 tabular-nums rtl:text-end"
                      >
                        {student.publicId}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-stone-600">
                        {formatDate(student.createdAt, locale)}
                      </span>
                      <StudentStatusBadge status={student.status} t={t} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={d.emptyTitle}
              body={d.emptyBody}
              action={
                canCreate && data.session ? (
                  <ButtonLink href={href("/admin/students/new")}>{d.register}</ButtonLink>
                ) : undefined
              }
            />
          )}
        </Section>
      </div>
    </>
  );
}
