import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminForm, Checkbox, Select, TextArea } from "@/components/admin/form";
import { DoneNotice, EmptyState, PageHeader, Section, Stat } from "@/components/admin/page-parts";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { isUuid } from "@/domain/admin-input";
import { englishOrdinal } from "@/domain/results";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/cn";
import {
  finalizeClassAction,
  publicationAction,
  reopenSheetAction,
} from "@/server/results/actions";
import { orNotFound } from "@/server/results/page-load";
import { readClassResults } from "@/server/results/read";
import { isReady } from "@/server/results/services";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/results/[termId]/[levelId]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.results.review } : {};
}

/**
 * One class in one term: subject progress, the full review matrix (with everything missing
 * made obvious), finalization, publication and corrections.
 */
export default async function ClassResultsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/results/[termId]/[levelId]">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "results.read");
  const { termId, levelId } = await params;
  if (!isUuid(termId) || !isUuid(levelId)) notFound();
  const { done } = await searchParams;
  const db = getDb();
  const data = await orNotFound(readClassResults(db, access, termId, levelId));
  const { scope, students, subjectProgress, readiness } = data;

  const r = t.admin.results;
  const s = t.sheet;
  const ar = locale === "ar";
  const num = (n: number) => formatNumber(n, locale);
  const can = (permission: Parameters<typeof hasPermission>[1]) =>
    hasPermission(access, permission);
  const editable = !scope.term.isLegacy;
  const canEnter = can("results.enter") && editable;
  const canPublish = can("results.publish");
  const levelName = ar ? scope.level.nameAr : scope.level.nameEn;
  const termName = ar ? scope.term.nameAr : scope.term.nameEn;
  const subjectName = (subject: { nameEn: string; nameAr: string }) =>
    ar ? subject.nameAr : subject.nameEn;
  const position = (n: number | null) =>
    n === null
      ? "—"
      : interpolate(s.positionOf, {
          position: ar ? num(n) : englishOrdinal(n),
          count: num(data.ranked),
        });
  const ready = isReady(readiness);
  const visible = data.schoolPublished && data.levelPublished;
  const hidden = { termId, levelId };
  const missing = students.filter((st) => !st.summary.complete);
  const finalized = students.filter((st) => st.sheetStatus === "finalized");
  const sheetHref = (st: (typeof students)[number]) =>
    st.sheetId && can("students.read")
      ? localizedPath(locale, `/admin/students/${st.studentId}/results/${st.sheetId}`)
      : null;
  const statusBadge = (status: "draft" | "finalized" | null) =>
    status === "finalized" ? (
      <Badge tone="success">{s.finalized}</Badge>
    ) : status === "draft" ? (
      <Badge tone="warning">{s.draft}</Badge>
    ) : (
      <Badge tone="neutral">{r.noResults}</Badge>
    );

  return (
    <>
      <PageHeader
        back={{ href: localizedPath(locale, `/admin/results?term=${termId}`), label: r.back }}
        eyebrow={
          <>
            <span dir="ltr">{scope.term.sessionLabel}</span> · {termName}
          </>
        }
        title={levelName}
        description={r.reviewHint}
        actions={
          <Badge tone={visible ? "success" : "neutral"}>
            {data.levelPublished ? r.published : r.notPublished}
          </Badge>
        }
      />
      <DoneNotice code={done} t={t} />
      {scope.term.isLegacy && (
        <Notice tone="info" className="mb-4">
          {r.legacyNote}
        </Notice>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={r.enrolled} value={num(readiness.enrolled)} tone="brand" />
        <Stat label={r.finalizedComplete} value={num(readiness.finalizedComplete)} />
        <Stat label={r.finalizedIncomplete} value={num(readiness.finalizedIncomplete)} />
        <Stat label={r.draft} value={num(readiness.draft)} />
        <Stat label={r.noResults} value={num(readiness.noResults)} />
      </div>

      {students.length === 0 ? (
        <EmptyState title={r.noStudents} />
      ) : (
        <div className="flex flex-col gap-4">
          <Section title={r.subjectsTitle}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjectProgress.map((subject) => {
                const done = subject.complete === students.length;
                return (
                  <li
                    key={subject.id}
                    className="flex flex-col gap-2 rounded-md border border-stone-200 p-4"
                  >
                    <span className="font-semibold text-charcoal-900">{subjectName(subject)}</span>
                    <span className={cn("text-sm", done ? "text-brand-800" : "text-warning-700")}>
                      {interpolate(r.progress, {
                        complete: num(subject.complete),
                        enrolled: num(students.length),
                      })}
                    </span>
                    {editable && (
                      <ButtonLink
                        href={localizedPath(
                          locale,
                          `/admin/results/${termId}/${levelId}/${subject.id}`,
                        )}
                        variant={canEnter ? "primary" : "secondary"}
                        className="self-start"
                      >
                        {canEnter ? r.enter : r.view}
                      </ButtonLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title={r.review} id="review">
            {/* Phones: one card per student. */}
            <ul className="flex flex-col gap-3 md:hidden">
              {students.map((st) => {
                const href = sheetHref(st);
                return (
                  <li key={st.enrollmentId} className="rounded-md border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="user-text font-semibold text-charcoal-900">
                          {href ? (
                            <Link href={href} className="hover:underline">
                              {st.fullName}
                            </Link>
                          ) : (
                            st.fullName
                          )}
                        </p>
                        <p dir="ltr" className="text-start text-xs text-stone-600 rtl:text-end">
                          {st.publicId}
                        </p>
                      </div>
                      {statusBadge(st.sheetStatus)}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      {scope.curriculum.map((subject, i) => {
                        const o = st.outcomes[i];
                        return (
                          <div key={subject.id} className="flex justify-between gap-2">
                            <dt className="truncate text-stone-600">{subjectName(subject)}</dt>
                            <dd className="font-semibold tabular-nums">
                              {o.total === null ? (
                                <span className="font-normal text-danger-700">—</span>
                              ) : (
                                <>
                                  {num(o.total)}
                                  <span className="ms-1 text-gold-700">{o.band?.grade}</span>
                                </>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    <p className="mt-2 border-t border-stone-200 pt-2 text-sm text-charcoal-700">
                      {s.totalScore}:{" "}
                      <span className="font-semibold">
                        {st.summary.totalScore === null ? "—" : num(st.summary.totalScore)}
                      </span>
                      {" · "}
                      {s.average}:{" "}
                      <span className="font-semibold">
                        {st.summary.average === null ? "—" : num(st.summary.average)}
                      </span>
                      {" · "}
                      {s.position}: <span className="font-semibold">{position(st.position)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>

            {/* Wider screens: the class matrix. */}
            <div className="hidden overflow-x-auto rounded-lg border border-stone-200 md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-sand-50 text-stone-600">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                      {r.student}
                    </th>
                    {scope.curriculum.map((subject) => (
                      <th
                        key={subject.id}
                        scope="col"
                        title={subjectName(subject)}
                        className="px-2 py-2.5 text-center font-semibold"
                      >
                        <span dir="ltr">{subject.code}</span>
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2.5 text-end font-semibold">
                      {s.total}
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-end font-semibold">
                      {s.average}
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-end font-semibold">
                      {s.position}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                      {r.sheet}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {students.map((st) => {
                    const href = sheetHref(st);
                    return (
                      <tr key={st.enrollmentId}>
                        <th scope="row" className="px-3 py-2 text-start font-normal">
                          <span className="user-text block font-semibold text-charcoal-900">
                            {href ? (
                              <Link href={href} className="hover:underline">
                                {st.fullName}
                              </Link>
                            ) : (
                              st.fullName
                            )}
                          </span>
                          <span
                            dir="ltr"
                            className="block text-start text-xs text-stone-600 rtl:text-end"
                          >
                            {st.publicId}
                          </span>
                        </th>
                        {st.outcomes.map((o, i) => (
                          <td
                            key={scope.curriculum[i].id}
                            className={cn(
                              "px-2 py-2 text-center tabular-nums",
                              o.total === null && "bg-danger-50",
                            )}
                          >
                            {o.total === null ? (
                              <span
                                className="text-danger-700"
                                title={s.notEntered}
                                aria-label={s.notEntered}
                              >
                                —
                              </span>
                            ) : (
                              <>
                                <span className="font-semibold">{num(o.total)}</span>
                                <span className="ms-1 text-gold-700">{o.band?.grade}</span>
                              </>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-end font-semibold tabular-nums">
                          {st.summary.totalScore === null ? "—" : num(st.summary.totalScore)}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {st.summary.average === null ? "—" : num(st.summary.average)}
                        </td>
                        <td className="px-2 py-2 text-end whitespace-nowrap tabular-nums">
                          {position(st.position)}
                        </td>
                        <td className="px-3 py-2">{statusBadge(st.sheetStatus)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={r.missing} id="missing">
            {missing.length === 0 ? (
              <p className="text-brand-800">{r.nothingMissing}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {missing.map((st) => (
                  <li key={st.enrollmentId} className="text-warning-700">
                    <span className="user-text">
                      {interpolate(r.missingItem, {
                        name: st.fullName,
                        count: num(st.summary.subjects - st.summary.completeSubjects),
                      })}
                    </span>
                    <span className="block text-sm text-stone-600">
                      {scope.curriculum
                        .filter((_, i) => st.outcomes[i].total === null)
                        .map(subjectName)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canEnter && (
            <Section title={r.finalize} id="finalize">
              <p className="mb-4 text-sm text-charcoal-700">{r.finalizeBody}</p>
              <AdminForm
                action={finalizeClassAction}
                locale={locale}
                hidden={hidden}
                messages={t.admin.errors}
                fieldMessages={t.admin.fieldErrors}
                submit={r.finalizeSubmit}
                submitting={t.admin.common.saving}
              >
                <Checkbox name="includeIncomplete" label={r.includeIncomplete} />
                <Checkbox name="confirm" label={t.admin.common.confirm} />
              </AdminForm>
            </Section>
          )}

          {canPublish && (
            <Section
              title={r.publication}
              id="publication"
              actions={
                <Badge tone={ready ? "success" : "warning"}>{ready ? r.ready : r.notReady}</Badge>
              }
            >
              <p className="mb-4 text-sm text-charcoal-700">{r.schoolBody}</p>
              {!data.schoolPublished && data.levelPublished && (
                <Notice tone="info" className="mb-4">
                  {r.school}: {r.notPublished}
                </Notice>
              )}
              <AdminForm
                action={publicationAction}
                locale={locale}
                hidden={{ ...hidden, publish: data.levelPublished ? "0" : "1" }}
                messages={t.admin.errors}
                fieldMessages={t.admin.fieldErrors}
                submit={data.levelPublished ? r.unpublishClass : r.publishClass}
                submitting={t.admin.common.saving}
                submitVariant={data.levelPublished ? "secondary" : "primary"}
              >
                {data.levelPublished ? (
                  <TextArea
                    name="reason"
                    label={t.admin.common.reason}
                    hint={t.admin.common.reasonHint}
                    maxLength={500}
                    rows={2}
                  />
                ) : (
                  !ready && <Checkbox name="acknowledgeIncomplete" label={r.acknowledge} />
                )}
                <Checkbox name="confirm" label={t.admin.common.confirm} />
              </AdminForm>
            </Section>
          )}

          {canEnter && (!data.levelPublished || canPublish) && (
            <Section title={r.correct} id="correct">
              <p className="mb-4 text-sm text-charcoal-700">{r.correctBody}</p>
              {data.levelPublished && (
                <Notice tone="warning" className="mb-4">
                  {r.correctPublished}
                </Notice>
              )}
              {finalized.length === 0 ? (
                <p className="text-stone-600">{r.noneFinalized}</p>
              ) : (
                <AdminForm
                  action={reopenSheetAction}
                  locale={locale}
                  hidden={hidden}
                  messages={t.admin.errors}
                  fieldMessages={t.admin.fieldErrors}
                  submit={r.correctSubmit}
                  submitting={t.admin.common.saving}
                  submitVariant="secondary"
                >
                  <Select
                    name="enrollmentId"
                    label={r.student}
                    placeholder=""
                    options={finalized.map((st) => ({
                      value: st.enrollmentId,
                      label: `${st.fullName} (${st.publicId})`,
                    }))}
                    wide
                  />
                  <TextArea
                    name="reason"
                    label={t.admin.common.reason}
                    hint={t.admin.common.reasonHint}
                    maxLength={500}
                    rows={2}
                  />
                </AdminForm>
              )}
            </Section>
          )}
        </div>
      )}
    </>
  );
}
