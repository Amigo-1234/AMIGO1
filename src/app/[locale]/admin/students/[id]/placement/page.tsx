import type { Metadata } from "next";
import { AdminForm, Checkbox, FieldGroup, Input, Select, TextArea } from "@/components/admin/form";
import { PageHeader } from "@/components/admin/page-parts";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { todayInLagos } from "@/domain/admin-input";
import { localizedPath } from "@/i18n/paths";
import { changeLevelAction, enrollStudentAction } from "@/server/admin/actions";
import { loadStudentPage } from "@/server/admin/load";
import { listLevels, sessionsAcceptingEnrollment } from "@/server/admin/queries";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Class placement: place a student who has no current class, or correct the level of the
 * current placement. Moving up a level at the end of a session is promotion (later phase).
 */
export default async function PlacementPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/placement">) {
  const { id } = await params;
  const { locale, t, db, profile } = await loadStudentPage(id, "enrollments.manage");
  const { student } = profile;
  const pl = t.admin.place;
  const back = {
    href: localizedPath(locale, `/admin/students/${student.id}`),
    label: student.fullName,
  };
  const levels = await listLevels(db, { activeOnly: true });
  const levelOptions = (exclude?: string) =>
    levels
      .filter((l) => l.id !== exclude)
      .map((l) => ({ value: l.id, label: `${locale === "ar" ? l.nameAr : l.nameEn} (${l.code})` }));
  const current = profile.activeEnrollment;

  if (current) {
    return (
      <>
        <PageHeader title={pl.correctTitle} description={pl.correctBody} back={back} />
        <Card className="p-5 sm:p-6">
          <AdminForm
            action={changeLevelAction}
            locale={locale}
            hidden={{ studentId: student.id, enrollmentId: current.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={pl.correctSubmit}
            submitting={t.admin.common.saving}
          >
            <p className="text-charcoal-700">
              {t.admin.profile.currentClass}:{" "}
              <strong>
                {locale === "ar" ? current.levelNameAr : current.levelNameEn} ({current.levelCode})
              </strong>{" "}
              · <span dir="ltr">{current.sessionLabel}</span>
            </p>
            <FieldGroup title={pl.newLevel}>
              <Select
                name="levelId"
                label={pl.newLevel}
                options={levelOptions(current.levelId)}
                wide
              />
              <TextArea
                name="reason"
                label={t.admin.common.reason}
                hint={t.admin.common.reasonHint}
                rows={2}
                maxLength={500}
              />
              <Checkbox name="confirm" label={t.admin.common.confirm} />
            </FieldGroup>
          </AdminForm>
        </Card>
      </>
    );
  }

  const enrolledSessions = new Set(profile.enrollments.map((e) => e.sessionId));
  const sessions = (await sessionsAcceptingEnrollment(db)).filter(
    (s) => !enrolledSessions.has(s.id),
  );
  return (
    <>
      <PageHeader title={pl.title} description={pl.body} back={back} />
      {student.status !== "active" ? (
        <Notice tone="warning">{pl.blocked}</Notice>
      ) : sessions.length === 0 ? (
        <Notice tone="warning">{pl.noSessions}</Notice>
      ) : (
        <Card className="p-5 sm:p-6">
          <AdminForm
            action={enrollStudentAction}
            locale={locale}
            hidden={{ studentId: student.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={pl.submit}
            submitting={pl.submitting}
          >
            <FieldGroup title={pl.title}>
              <Select
                name="sessionId"
                label={t.admin.fields.session}
                options={sessions.map((s) => ({
                  value: s.id,
                  label: `${s.label} · ${t.admin.sessionStatus[s.status]}`,
                }))}
              />
              <Select name="levelId" label={t.admin.fields.level} options={levelOptions()} />
              <Input
                name="enrolledOn"
                type="date"
                label={t.admin.fields.enrolledOn}
                optional={t.admin.common.optional}
                initial={todayInLagos()}
              />
            </FieldGroup>
          </AdminForm>
        </Card>
      )}
    </>
  );
}
