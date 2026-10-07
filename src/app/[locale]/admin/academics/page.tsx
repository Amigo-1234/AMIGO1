import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminForm, FieldGroup, Input } from "@/components/admin/form";
import { DoneNotice, EmptyState, PageHeader, Section } from "@/components/admin/page-parts";
import { ChevronForwardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { createSessionAction } from "@/server/admin/actions";
import { levelOverview, listSessions } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaff } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/academics">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.academics.title } : {};
}

const sessionTone = (status: string) =>
  status === "active" ? "success" : status === "planned" ? "accent" : "neutral";

/** Sessions with their terms, and the levels of the curriculum. */
export default async function AcademicsPage({
  searchParams,
}: PageProps<"/[locale]/admin/academics">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  const canManage = hasPermission(access, "sessions.manage");
  if (!canManage && !hasPermission(access, "students.read"))
    redirect(localizedPath(locale, "/admin?denied=1"));
  const a = t.admin.academics;
  const db = getDb();
  const [sessions, levels] = await Promise.all([listSessions(db), levelOverview(db)]);
  const { done } = await searchParams;
  const nextYear = sessions.length
    ? Math.max(...sessions.map((s) => s.startYear)) + 1
    : new Date().getFullYear();

  return (
    <>
      <PageHeader title={a.title} description={a.subtitle} />
      <DoneNotice code={done} t={t} />
      <div className="flex flex-col gap-4">
        <Section title={a.sessions}>
          {sessions.length === 0 ? (
            <EmptyState title={a.noSessions} body={canManage ? a.newSessionBody : a.manageNote} />
          ) : (
            <ul className="divide-y divide-stone-200">
              {sessions.map((session) => {
                const current = session.terms.find((term) => term.status === "active");
                return (
                  <li key={session.id}>
                    <Link
                      href={localizedPath(locale, `/admin/academics/sessions/${session.id}`)}
                      className="flex min-h-14 items-center gap-3 py-3 hover:bg-sand-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            dir="ltr"
                            className="text-lg font-semibold text-brand-950 tabular-nums"
                          >
                            {session.label}
                          </span>
                          <Badge tone={sessionTone(session.status)}>
                            {t.admin.sessionStatus[session.status]}
                          </Badge>
                          {current && (
                            <Badge tone="success">
                              {locale === "ar" ? current.nameAr : current.nameEn}
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-stone-600">
                          {interpolate(a.enrollments, {
                            count: formatNumber(session.activeEnrollments, locale),
                          })}
                        </span>
                      </span>
                      <ChevronForwardIcon className="size-5 shrink-0 text-stone-400 rtl:-scale-x-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {canManage && (
          <Section title={a.newSession}>
            <p className="mb-4 text-sm text-charcoal-700">{a.newSessionBody}</p>
            <AdminForm
              action={createSessionAction}
              locale={locale}
              messages={t.admin.errors}
              fieldMessages={t.admin.fieldErrors}
              submit={a.create}
              submitting={a.creating}
            >
              <FieldGroup title={a.newSession}>
                <Input
                  name="startYear"
                  label={t.admin.fields.startYear}
                  hint={t.admin.fields.startYearHint}
                  initial={String(nextYear)}
                  inputMode="numeric"
                  maxLength={4}
                  ltr
                  wide
                />
                <Input
                  name="startsOn"
                  type="date"
                  label={t.admin.fields.startsOn}
                  optional={t.admin.common.optional}
                />
                <Input
                  name="endsOn"
                  type="date"
                  label={t.admin.fields.endsOn}
                  optional={t.admin.common.optional}
                />
              </FieldGroup>
            </AdminForm>
          </Section>
        )}

        <Section title={a.levels}>
          <p className="mb-4 text-sm text-charcoal-700">{a.levelsBody}</p>
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b border-stone-200 bg-sand-50 text-stone-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    {a.code}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    {a.name}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    {a.next}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-semibold">
                    {a.subjects}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-semibold">
                    {a.currentStudents}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {levels.map((level) => (
                  <tr key={level.id}>
                    <td className="px-3 py-2.5 font-semibold text-brand-900" dir="ltr">
                      {level.code}
                    </td>
                    <td className="px-3 py-2.5">
                      {locale === "ar" ? level.nameAr : level.nameEn}
                      {(locale === "ar" ? level.stageAr : level.stageEn) && (
                        <span className="block text-xs text-stone-600">
                          {locale === "ar" ? level.stageAr : level.stageEn}
                        </span>
                      )}
                      {!level.isActive && <Badge className="ms-2">{a.inactive}</Badge>}
                    </td>
                    <td className="px-3 py-2.5" dir={level.nextLevelCode ? "ltr" : undefined}>
                      {level.nextLevelCode ?? <span className="text-stone-600">{a.graduates}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(level.subjects, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(level.activeEnrollments, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
