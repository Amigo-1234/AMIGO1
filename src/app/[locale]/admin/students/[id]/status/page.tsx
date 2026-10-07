import type { Metadata } from "next";
import { AdminForm, Checkbox, RadioGroup, TextArea } from "@/components/admin/form";
import { PageHeader, StudentStatusBadge } from "@/components/admin/page-parts";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { allowedStatusChanges, restoreTarget } from "@/domain/student-lifecycle";
import { interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { changeStatusAction, restoreStudentAction } from "@/server/admin/actions";
import { loadStudentPage } from "@/server/admin/load";
import { statusBeforeArchive } from "@/server/admin/students";

export const metadata: Metadata = { robots: { index: false } };

/** Status changes need a reason and an explicit confirmation; the effects are spelled out. */
export default async function StudentStatusPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/status">) {
  const { id } = await params;
  const { locale, t, db, profile } = await loadStudentPage(id, "students.archive");
  const { student } = profile;
  const s = t.admin.status;
  const back = {
    href: localizedPath(locale, `/admin/students/${student.id}`),
    label: student.fullName,
  };
  const reasonFields = (
    <>
      <TextArea
        name="reason"
        label={t.admin.common.reason}
        hint={t.admin.common.reasonHint}
        rows={2}
        maxLength={500}
      />
      <Checkbox name="confirm" label={t.admin.common.confirm} />
    </>
  );

  if (student.status === "archived") {
    const target = restoreTarget(await statusBeforeArchive(db, student.id));
    return (
      <>
        <PageHeader title={s.restoreTitle} back={back} />
        <Card className="p-5 sm:p-6">
          <p className="mb-5 text-charcoal-700">
            {interpolate(s.restoreBody, { status: t.admin.studentStatus[target] })}
          </p>
          <AdminForm
            action={restoreStudentAction}
            locale={locale}
            hidden={{ studentId: student.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={s.restoreSubmit}
            submitting={s.submitting}
          >
            {reasonFields}
          </AdminForm>
        </Card>
      </>
    );
  }

  const options = allowedStatusChanges(student.status);
  return (
    <>
      <PageHeader title={s.title} back={back} />
      <Card className="p-5 sm:p-6">
        <p className="mb-5 flex flex-wrap items-center gap-2 text-charcoal-700">
          {s.current}: <StudentStatusBadge status={student.status} t={t} />
        </p>
        {options.length === 0 ? (
          <Notice tone="info">{s.none}</Notice>
        ) : (
          <AdminForm
            action={changeStatusAction}
            locale={locale}
            hidden={{ studentId: student.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={s.submit}
            submitting={s.submitting}
            submitVariant="danger"
          >
            <RadioGroup
              name="to"
              legend={s.to}
              options={options.map((status) => ({
                value: status,
                label: t.admin.studentStatus[status],
                description: s.effect[status],
              }))}
            />
            {reasonFields}
          </AdminForm>
        )}
      </Card>
    </>
  );
}
