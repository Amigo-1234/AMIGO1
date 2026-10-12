import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm, Checkbox, TextArea } from "@/components/admin/form";
import { DoneNotice, EmptyState, PageHeader, Section } from "@/components/admin/page-parts";
import { ChevronForwardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { publicationAction } from "@/server/results/actions";
import { resultTerms } from "@/server/results/queries";
import { readTermOverview } from "@/server/results/read";
import { isReady } from "@/server/results/services";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/results">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.results.title } : {};
}

/** Results workspace: pick a term, see every class's progress, publish for the school. */
export default async function ResultsPage({ searchParams }: PageProps<"/[locale]/admin/results">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "results.read");
  const r = t.admin.results;
  const db = getDb();
  const { term: rawTerm, done } = await searchParams;
  const terms = await resultTerms(db);
  const termName = (term: { nameEn: string; nameAr: string }) =>
    locale === "ar" ? term.nameAr : term.nameEn;

  if (!terms.length)
    return (
      <>
        <PageHeader title={r.title} description={r.subtitle} />
        <EmptyState title={r.noTerms} />
      </>
    );

  const wanted = Array.isArray(rawTerm) ? rawTerm[0] : rawTerm;
  const selected =
    terms.find((term) => term.id === wanted) ??
    terms.find((term) => term.sessionStatus === "active" && term.status === "active") ??
    terms[0];
  const overview = await readTermOverview(db, access, selected.id);
  const canPublish = hasPermission(access, "results.publish");
  const num = (n: number) => formatNumber(n, locale);

  return (
    <>
      <PageHeader title={r.title} description={r.subtitle} />
      <DoneNotice code={done} t={t} />
      <div className="flex flex-col gap-4">
        <Section title={r.term}>
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="results-term" className="text-sm font-semibold text-charcoal-900">
                {r.term}
              </label>
              <select
                id="results-term"
                name="term"
                defaultValue={selected.id}
                className={`${inputClasses} appearance-auto`}
              >
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.sessionLabel} · {termName(term)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              {r.choose}
            </Button>
          </form>
          {selected.isLegacy && (
            <Notice tone="info" className="mt-4">
              {r.legacyNote}
            </Notice>
          )}
        </Section>

        <Section
          title={r.school}
          actions={
            <Badge tone={overview?.schoolPublished ? "success" : "neutral"}>
              {overview?.schoolPublished ? r.published : r.notPublished}
            </Badge>
          }
        >
          <p className="text-sm text-charcoal-700">{r.schoolBody}</p>
          {canPublish && overview && (
            <AdminForm
              action={publicationAction}
              locale={locale}
              hidden={{
                termId: selected.id,
                levelId: "",
                publish: overview.schoolPublished ? "0" : "1",
              }}
              messages={t.admin.errors}
              fieldMessages={t.admin.fieldErrors}
              submit={overview.schoolPublished ? r.unpublishSchool : r.publishSchool}
              submitting={t.admin.common.saving}
              submitVariant={overview.schoolPublished ? "secondary" : "primary"}
              className="mt-4"
            >
              {overview.schoolPublished && (
                <TextArea
                  name="reason"
                  label={t.admin.common.reason}
                  hint={t.admin.common.reasonHint}
                  maxLength={500}
                  rows={2}
                />
              )}
              <Checkbox name="confirm" label={t.admin.common.confirm} />
            </AdminForm>
          )}
        </Section>

        <Section title={r.classes}>
          {!overview || overview.levels.length === 0 ? (
            <EmptyState title={r.noStudents} />
          ) : (
            <ul className="divide-y divide-stone-200">
              {overview.levels.map(({ level, subjects, readiness, published }) => (
                <li key={level.id}>
                  <Link
                    href={localizedPath(locale, `/admin/results/${selected.id}/${level.id}`)}
                    className="flex min-h-14 items-center gap-3 py-3 hover:bg-sand-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-brand-950">
                          {locale === "ar" ? level.nameAr : level.nameEn}
                        </span>
                        <span dir="ltr" className="text-sm text-stone-600">
                          {level.code}
                        </span>
                        {readiness.enrolled > 0 &&
                          (isReady(readiness) ? (
                            <Badge tone="success">{r.ready}</Badge>
                          ) : (
                            <Badge tone="warning">{r.notReady}</Badge>
                          ))}
                        <Badge tone={published ? "success" : "neutral"}>
                          {published ? r.published : r.notPublished}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block text-sm text-stone-600">
                        {r.enrolled} {num(readiness.enrolled)} · {r.subjects} {num(subjects)}
                        {readiness.enrolled > 0 && (
                          <>
                            {" · "}
                            {interpolate(r.progress, {
                              complete: num(readiness.finalizedComplete),
                              enrolled: num(readiness.enrolled),
                            })}
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronForwardIcon className="size-5 shrink-0 text-stone-400 rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
