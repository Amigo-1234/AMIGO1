import type { Metadata } from "next";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { notFound, redirect } from "next/navigation";
import { AdminForm, Checkbox, Input } from "@/components/admin/form";
import { DoneNotice, PageHeader, Section } from "@/components/admin/page-parts";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { canActivateTerm, canCloseSession } from "@/domain/academic-calendar";
import { isUuid } from "@/domain/admin-input";
import { getDb } from "@/db/client";
import { formatDay, formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import {
  calendarTransitionAction,
  updateSessionDatesAction,
  updateTermDatesAction,
} from "@/server/admin/actions";
import { getSession } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaff } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/academics/sessions/[sessionId]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.fields.session } : {};
}

const tone = (status: string) =>
  status === "active" ? "success" : status === "planned" ? "accent" : "neutral";

/** One session: dates, status changes (each confirmed) and its terms. */
export default async function SessionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/academics/sessions/[sessionId]">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  const canManage = hasPermission(access, "sessions.manage");
  if (!canManage && !hasPermission(access, "students.read"))
    redirect(localizedPath(locale, "/admin?denied=1"));
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();
  const session = await getSession(getDb(), sessionId);
  if (!session) notFound();
  const { done } = await searchParams;
  const s = t.admin.session;
  const editable = canManage && (session.status === "planned" || session.status === "active");
  const formProps = {
    locale,
    messages: t.admin.errors,
    fieldMessages: t.admin.fieldErrors,
    submitting: t.admin.common.saving,
  };
  const dateRange = [formatDay(session.startsOn, locale), formatDay(session.endsOn, locale)]
    .filter(Boolean)
    .join(" – ");

  return (
    <>
      <PageHeader
        back={{ href: localizedPath(locale, "/admin/academics"), label: t.admin.academics.title }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {interpolate(s.title, { label: session.label })}
            <Badge tone={tone(session.status)}>{t.admin.sessionStatus[session.status]}</Badge>
          </span>
        }
        description={dateRange || undefined}
      />
      <DoneNotice code={done} t={t} />

      <div className="flex flex-col gap-4">
        <Section title={s.enrollments}>
          <p className="flex flex-wrap gap-x-6 gap-y-1 text-charcoal-700">
            <span>
              {interpolate(s.activeEnrollments, {
                count: formatNumber(session.activeEnrollments, locale),
              })}
            </span>
            <span>
              {interpolate(s.totalEnrollments, {
                count: formatNumber(session.totalEnrollments, locale),
              })}
            </span>
          </p>
        </Section>

        <Section title={s.terms}>
          {session.status === "planned" && (
            <p className="mb-4 text-sm text-charcoal-700">{s.plannedNote}</p>
          )}
          <ul className="flex flex-col gap-4">
            {session.terms.map((term) => {
              const termName = locale === "ar" ? term.nameAr : term.nameEn;
              return (
                <li key={term.id} className="rounded-md border border-stone-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-charcoal-900">{termName}</span>
                    <Badge tone={tone(term.status)}>{t.admin.termStatus[term.status]}</Badge>
                    <span className="text-sm text-stone-600">
                      {[formatDay(term.startsOn, locale), formatDay(term.endsOn, locale)]
                        .filter(Boolean)
                        .join(" – ")}
                    </span>
                  </div>
                  {editable && (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <AdminForm
                        {...formProps}
                        action={updateTermDatesAction}
                        hidden={{ sessionId: session.id, termId: term.id }}
                        submit={s.saveTermDates}
                        submitVariant="secondary"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            name="startsOn"
                            type="date"
                            label={t.admin.fields.startsOn}
                            initial={term.startsOn}
                          />
                          <Input
                            name="endsOn"
                            type="date"
                            label={t.admin.fields.endsOn}
                            initial={term.endsOn}
                          />
                        </div>
                      </AdminForm>
                      {canActivateTerm(term.status, session.status) && (
                        <AdminForm
                          {...formProps}
                          action={calendarTransitionAction}
                          hidden={{
                            sessionId: session.id,
                            termId: term.id,
                            transition: "activate_term",
                          }}
                          submit={s.activateTerm}
                        >
                          {session.terms.some((other) => other.status === "active") && (
                            <p className="text-sm text-charcoal-700">{s.termConfirm}</p>
                          )}
                          <Checkbox name="confirm" label={t.admin.common.confirm} />
                        </AdminForm>
                      )}
                      {term.status === "active" && (
                        <AdminForm
                          {...formProps}
                          action={calendarTransitionAction}
                          hidden={{
                            sessionId: session.id,
                            termId: term.id,
                            transition: "close_term",
                          }}
                          submit={s.closeTerm}
                          submitVariant="danger"
                        >
                          <Checkbox name="confirm" label={t.admin.common.confirm} />
                        </AdminForm>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {editable && (
          <Section title={s.dates}>
            <AdminForm
              {...formProps}
              action={updateSessionDatesAction}
              hidden={{ sessionId: session.id }}
              submit={s.saveDates}
            >
              <p className="text-sm text-charcoal-700">{s.datesHint}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  name="startsOn"
                  type="date"
                  label={t.admin.fields.startsOn}
                  initial={session.startsOn}
                />
                <Input
                  name="endsOn"
                  type="date"
                  label={t.admin.fields.endsOn}
                  initial={session.endsOn}
                />
              </div>
            </AdminForm>
          </Section>
        )}

        {canManage && (
          <Section title={s.lifecycle}>
            {session.status === "planned" && (
              <AdminForm
                {...formProps}
                action={calendarTransitionAction}
                hidden={{ sessionId: session.id, transition: "activate_session" }}
                submit={s.activate}
              >
                <p className="text-charcoal-700">{s.activateBody}</p>
                <Checkbox name="confirm" label={t.admin.common.confirm} />
              </AdminForm>
            )}
            {session.status === "active" &&
              (canCloseSession(session.status, session.activeEnrollments) ? (
                <AdminForm
                  {...formProps}
                  action={calendarTransitionAction}
                  hidden={{ sessionId: session.id, transition: "close_session" }}
                  submit={s.close}
                  submitVariant="danger"
                >
                  <p className="text-charcoal-700">{s.closeBody}</p>
                  <Checkbox name="confirm" label={t.admin.common.confirm} />
                </AdminForm>
              ) : (
                <Notice tone="info">
                  {interpolate(s.closeBlocked, {
                    count: formatNumber(session.activeEnrollments, locale),
                  })}
                </Notice>
              ))}
            {(session.status === "closed" || session.status === "archived") && (
              <p className="text-charcoal-700">{s.closedNote}</p>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
