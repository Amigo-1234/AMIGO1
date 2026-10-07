import type { Metadata } from "next";
import { AdminForm, FieldGroup } from "@/components/admin/form";
import { PageHeader } from "@/components/admin/page-parts";
import { StudentDetailFields } from "@/components/admin/student-fields";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { localizedPath } from "@/i18n/paths";
import { updateStudentAction } from "@/server/admin/actions";
import { loadStudentPage } from "@/server/admin/load";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditStudentPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/edit">) {
  const { id } = await params;
  const { locale, t, profile } = await loadStudentPage(id, "students.update");
  const { student } = profile;
  const e = t.admin.edit;
  return (
    <>
      <PageHeader
        title={e.title}
        description={
          <>
            {student.fullName} · <span dir="ltr">{student.publicId}</span> — {e.subtitle}
          </>
        }
        back={{
          href: localizedPath(locale, `/admin/students/${student.id}`),
          label: student.fullName,
        }}
      />
      {student.status === "archived" ? (
        <Notice tone="warning">{t.admin.errors.archived_read_only}</Notice>
      ) : (
        <Card className="p-5 sm:p-6">
          <AdminForm
            action={updateStudentAction}
            locale={locale}
            hidden={{ studentId: student.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={t.admin.common.save}
            submitting={t.admin.common.saving}
          >
            <FieldGroup title={t.admin.create.personal}>
              <StudentDetailFields t={t} initial={student} />
            </FieldGroup>
          </AdminForm>
        </Card>
      )}
    </>
  );
}
