import type { Metadata } from "next";
import { AdminForm, Checkbox, TextArea } from "@/components/admin/form";
import { IssuePinForm } from "@/components/admin/issue-pin-form";
import { PageHeader, Section, StudentStatusBadge } from "@/components/admin/page-parts";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatDate, formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { revokeAccessAction } from "@/server/admin/credential-actions";
import { loadStudentPage } from "@/server/admin/load";
import { canSignIn } from "@/server/student-auth/rules";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students/[id]/access">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.access.title } : {};
}

// Shows a freshly issued PIN; never cache.
export const dynamic = "force-dynamic";

/** Issue, reset or revoke a student's portal PIN (`student_credentials.reset`). */
export default async function StudentAccessPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/access">) {
  const { id } = await params;
  const { locale, t, profile } = await loadStudentPage(id, "student_credentials.reset");
  const { student, signIn } = profile;
  const a = t.admin.access;
  const p = t.admin.profile;
  const profileHref = localizedPath(locale, `/admin/students/${student.id}`);
  const hasAccess = !!signIn.pin || !!signIn.legacy;
  const eligible = canSignIn(student.status);

  return (
    <>
      <PageHeader
        back={{ href: profileHref, label: student.fullName }}
        eyebrow={
          <span dir="ltr" className="tracking-normal normal-case tabular-nums">
            {student.publicId}
          </span>
        }
        title={a.title}
        description={a.subtitle}
        actions={<StudentStatusBadge status={student.status} t={t} />}
      />
      <div className="flex flex-col gap-4">
        <Section title={a.status}>
          <ul className="flex flex-col gap-1.5 text-sm text-charcoal-700">
            {signIn.pin ? (
              <li>
                {interpolate(p.pinSet, { date: formatDate(signIn.pin.createdAt, locale) })}
                {signIn.pin.issuedByStaff && <> · {a.waitingChange}</>}
              </li>
            ) : (
              !signIn.legacy && <li>{a.noAccess}</li>
            )}
            {signIn.legacy && <li>{p.legacyActive}</li>}
            <li>
              {signIn.lastSignIn
                ? interpolate(a.lastSignIn, { date: formatDate(signIn.lastSignIn, locale) })
                : a.neverSignedIn}
            </li>
            {signIn.openSessions > 0 && (
              <li>
                {interpolate(p.openSessions, {
                  count: formatNumber(signIn.openSessions, locale),
                })}
              </li>
            )}
          </ul>
        </Section>

        <Section title={hasAccess ? a.resetTitle : a.issueTitle}>
          {eligible ? (
            <>
              <p className="mb-4 text-sm text-charcoal-700">
                {hasAccess ? a.resetBody : a.issueBody}
              </p>
              <IssuePinForm
                locale={locale}
                studentId={student.id}
                doneHref={profileHref}
                strings={{
                  confirm: a.confirmIssue,
                  confirmRequired: t.admin.fieldErrors.required,
                  submit: hasAccess ? a.submitReset : a.submitIssue,
                  submitting: a.generating,
                  issuedTitle: a.issuedTitle,
                  resetTitle: a.resetDone,
                  issuedBody: a.issuedBody,
                  pinLabel: a.pinLabel,
                  done: a.done,
                  errors: t.admin.errors,
                }}
              />
            </>
          ) : (
            <Notice tone="warning">
              {interpolate(a.cannotSignIn, { status: t.admin.studentStatus[student.status] })}
            </Notice>
          )}
        </Section>

        {(hasAccess || signIn.openSessions > 0) && (
          <Section title={a.revokeTitle}>
            <p className="mb-4 text-sm text-charcoal-700">{a.revokeBody}</p>
            <AdminForm
              action={revokeAccessAction}
              locale={locale}
              hidden={{ studentId: student.id }}
              messages={t.admin.errors}
              fieldMessages={t.admin.fieldErrors}
              submit={a.revokeSubmit}
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
        )}
      </div>
    </>
  );
}
