import type { Metadata } from "next";
import { AdminForm, Checkbox, FieldGroup, Select } from "@/components/admin/form";
import { EmptyState, PageHeader } from "@/components/admin/page-parts";
import { GuardianFields, StudentDetailFields } from "@/components/admin/student-fields";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatStudentId } from "@/domain/student-id";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { registerStudentAction } from "@/server/admin/actions";
import { listLevels, sessionsAcceptingEnrollment } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students/new">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.create.title } : {};
}

/** Student intake. The server validates everything and issues the permanent ID. */
export default async function NewStudentPage() {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "students.create");
  const c = t.admin.create;
  const db = getDb();
  const [sessions, levels] = await Promise.all([
    sessionsAcceptingEnrollment(db),
    listLevels(db, { activeOnly: true }),
  ]);
  const back = { href: localizedPath(locale, "/admin/students"), label: t.admin.students.title };

  if (!sessions.length) {
    return (
      <>
        <PageHeader title={c.title} back={back} />
        <EmptyState
          title={c.noSessionsTitle}
          body={c.noSessionsBody}
          action={
            hasPermission(access, "sessions.manage") ? (
              <ButtonLink href={localizedPath(locale, "/admin/academics")}>
                {c.noSessionsAction}
              </ButtonLink>
            ) : (
              <p className="text-sm text-stone-600">{c.noSessionsAsk}</p>
            )
          }
        />
      </>
    );
  }

  const canPlace = hasPermission(access, "enrollments.manage");
  const canAddGuardian = hasPermission(access, "students.update");
  const example = formatStudentId({
    levelCode: levels[0]?.code ?? "IBT",
    year: sessions[0].startYear,
    serial: 1,
  });

  return (
    <>
      <PageHeader title={c.title} description={c.subtitle} back={back} />
      <Card className="p-5 sm:p-6">
        <AdminForm
          action={registerStudentAction}
          locale={locale}
          messages={t.admin.errors}
          fieldMessages={t.admin.fieldErrors}
          submit={c.submit}
          submitting={c.submitting}
        >
          <FieldGroup title={c.personal}>
            <StudentDetailFields t={t} />
          </FieldGroup>
          <FieldGroup title={c.admission} description={interpolate(c.idRule, { example })}>
            <Select
              name="levelId"
              label={t.admin.fields.level}
              initial={levels[0]?.id}
              options={levels.map((l) => ({
                value: l.id,
                label: `${locale === "ar" ? l.nameAr : l.nameEn} (${l.code})`,
              }))}
            />
            <Select
              name="sessionId"
              label={t.admin.fields.session}
              initial={sessions[0].id}
              options={sessions.map((s) => ({
                value: s.id,
                label: `${s.label} · ${t.admin.sessionStatus[s.status]}`,
              }))}
            />
            {canPlace && (
              <Checkbox name="enrollNow" label={c.enrollNow} hint={c.enrollNowHint} initial />
            )}
          </FieldGroup>
          {canAddGuardian && (
            <FieldGroup title={c.guardian} description={c.guardianHint}>
              <GuardianFields t={t} prefix="guardian." />
            </FieldGroup>
          )}
        </AdminForm>
      </Card>
    </>
  );
}
