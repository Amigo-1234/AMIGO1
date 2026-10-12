import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Section } from "@/components/admin/page-parts";
import { RosterEditor } from "@/components/results/roster-editor";
import { isUuid } from "@/domain/admin-input";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { orNotFound } from "@/server/results/page-load";
import { readSubjectRoster } from "@/server/results/read";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/results/[termId]/[levelId]/[subjectId]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.results.enter } : {};
}

/** Roster score entry for one subject of one class in one term. */
export default async function ScoreEntryPage({
  params,
}: PageProps<"/[locale]/admin/results/[termId]/[levelId]/[subjectId]">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "results.read");
  const { termId, levelId, subjectId } = await params;
  if (!isUuid(termId) || !isUuid(levelId) || !isUuid(subjectId)) notFound();
  const db = getDb();
  const { scope, rows } = await orNotFound(
    readSubjectRoster(db, access, termId, levelId, subjectId),
  );
  const subject = scope.subject!;
  const r = t.admin.results;
  const s = t.sheet;
  const ar = locale === "ar";
  const termName = ar ? scope.term.nameAr : scope.term.nameEn;
  const policy = scope.policy;

  return (
    <>
      <PageHeader
        back={{
          href: localizedPath(locale, `/admin/results/${termId}/${levelId}`),
          label: ar ? scope.level.nameAr : scope.level.nameEn,
        }}
        eyebrow={
          <>
            <span dir="ltr">{scope.term.sessionLabel}</span> · {termName}
          </>
        }
        title={interpolate(r.entryTitle, {
          subject: ar ? subject.nameAr : subject.nameEn,
          level: ar ? scope.level.nameAr : scope.level.nameEn,
        })}
        description={interpolate(r.entryBody, {
          ca: formatNumber(policy.caMax, locale),
          exam: formatNumber(policy.examMax, locale),
        })}
      />
      <Section title={r.enter}>
        {rows.length === 0 ? (
          <EmptyState title={r.noStudents} />
        ) : (
          <RosterEditor
            termId={termId}
            levelId={levelId}
            subjectId={subjectId}
            caMax={policy.caMax}
            examMax={policy.examMax}
            bands={policy.bands}
            canEdit={hasPermission(access, "results.enter")}
            rows={rows.map((row) => ({
              enrollmentId: row.enrollmentId,
              fullName: row.fullName,
              publicId: row.publicId,
              sheetStatus: row.sheetStatus,
              ca: row.ca,
              exam: row.exam,
              version: row.version,
            }))}
            strings={{
              student: r.student,
              ca: s.ca,
              exam: s.exam,
              total: s.total,
              grade: s.grade,
              locked: r.locked,
              lockedNote: r.lockedNote,
              max: r.max,
              unsaved: r.unsaved,
              allSaved: r.allSaved,
              save: r.saveScores,
              saving: r.savingScores,
              savedCount: r.savedCount,
              noChanges: r.noChanges,
              reload: r.reload,
              conflictNames: r.conflictNames,
              keyboard: r.keyboard,
              reason: r.reason,
              reasonHint: r.reasonHint,
              leaveWarning: r.leaveWarning,
              errors: t.admin.errors,
            }}
          />
        )}
      </Section>
    </>
  );
}
