import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm, Checkbox, FieldGroup, TextArea } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/page-parts";
import { GuardianFields } from "@/components/admin/student-fields";
import { Notice } from "@/components/ui/notice";
import { isUuid } from "@/domain/admin-input";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { unlinkGuardianAction, updateGuardianAction } from "@/server/admin/actions";
import { loadStudentPage } from "@/server/admin/load";
import { getGuardian } from "@/server/admin/queries";

export const metadata: Metadata = { robots: { index: false } };

/** Edit a guardian (shared details + this student's link) or remove them from this student. */
export default async function EditGuardianPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/guardians/[guardianId]">) {
  const { id, guardianId } = await params;
  const { locale, t, db, profile } = await loadStudentPage(id, "students.update");
  if (!isUuid(guardianId)) notFound();
  const data = await getGuardian(db, guardianId);
  const link = data?.linked.find((l) => l.studentId === profile.student.id);
  if (!data || !link) notFound();
  const { student } = profile;
  const g = t.admin.guardians;
  const back = {
    href: localizedPath(locale, `/admin/students/${student.id}`),
    label: student.fullName,
  };

  if (student.status === "archived")
    return (
      <>
        <PageHeader title={g.editTitle} back={back} />
        <Notice tone="warning">{t.admin.errors.archived_read_only}</Notice>
      </>
    );

  return (
    <>
      <PageHeader title={g.editTitle} description={data.guardian.fullName} back={back} />
      {data.linked.length > 1 && (
        <Notice tone="warning" className="mb-4">
          {interpolate(g.shared, { count: formatNumber(data.linked.length, locale) })}
        </Notice>
      )}
      <div className="flex flex-col gap-4">
        <Section title={g.details}>
          <AdminForm
            action={updateGuardianAction}
            locale={locale}
            hidden={{ studentId: student.id, guardianId }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={t.admin.common.save}
            submitting={t.admin.common.saving}
          >
            <FieldGroup title={g.details}>
              <GuardianFields
                t={t}
                initial={{ ...data.guardian, relationship: link.relationship }}
                primaryInitial={link.isPrimaryContact}
              />
            </FieldGroup>
          </AdminForm>
        </Section>
        <Section title={g.unlinkTitle}>
          <p className="mb-4 text-charcoal-700">{g.unlinkBody}</p>
          <AdminForm
            action={unlinkGuardianAction}
            locale={locale}
            hidden={{ studentId: student.id, guardianId }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={g.unlinkSubmit}
            submitting={t.admin.common.saving}
            submitVariant="danger"
          >
            <TextArea
              name="reason"
              label={t.admin.common.reason}
              hint={t.admin.common.reasonHint}
              rows={2}
              maxLength={500}
            />
            <Checkbox name="confirm" label={t.admin.common.confirm} />
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
