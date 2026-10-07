import type { Metadata } from "next";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { AdminForm, Checkbox, FieldGroup, Input } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/page-parts";
import { GuardianFields } from "@/components/admin/student-fields";
import { SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { addGuardianAction, linkGuardianAction } from "@/server/admin/actions";
import { loadStudentPage } from "@/server/admin/load";
import { searchGuardians } from "@/server/admin/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students/[id]/guardians/new">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.guardians.addTitle } : {};
}

/** Add a guardian: first offer existing guardians (siblings), then a new-guardian form. */
export default async function AddGuardianPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/students/[id]/guardians/new">) {
  const { id } = await params;
  const { locale, t, db, profile } = await loadStudentPage(id, "students.update");
  const { student } = profile;
  const g = t.admin.guardians;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";
  const matches = q.length >= 2 ? await searchGuardians(db, q, student.id) : null;
  const here = localizedPath(locale, `/admin/students/${student.id}/guardians/new`);
  const back = {
    href: localizedPath(locale, `/admin/students/${student.id}`),
    label: student.fullName,
  };

  if (student.status === "archived")
    return (
      <>
        <PageHeader title={g.addTitle} back={back} />
        <Notice tone="warning">{t.admin.errors.archived_read_only}</Notice>
      </>
    );

  return (
    <>
      <PageHeader title={g.addTitle} back={back} />
      <div className="flex flex-col gap-4">
        <Section title={g.findTitle}>
          <form
            method="get"
            action={here}
            role="search"
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="guardian-q" className="text-sm font-semibold text-charcoal-900">
                {g.search}
              </label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
                <input
                  id="guardian-q"
                  name="q"
                  type="search"
                  defaultValue={q}
                  maxLength={80}
                  autoComplete="off"
                  aria-describedby="guardian-q-hint"
                  className={cn(inputClasses, "ps-9")}
                />
              </div>
              <p id="guardian-q-hint" className="text-sm text-stone-600">
                {g.findHint}
              </p>
            </div>
            <button
              type="submit"
              className={cn(buttonClasses({ variant: "secondary" }), "sm:mb-7")}
            >
              {g.search}
            </button>
          </form>
          {matches && (
            <div className="mt-4">
              {matches.length === 0 ? (
                <p className="text-charcoal-700">{g.noMatches}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {matches.map((m) => (
                    <li key={m.id} className="rounded-md border border-stone-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-charcoal-900">{m.fullName}</p>
                          <p
                            dir="ltr"
                            className="text-start text-sm text-charcoal-700 rtl:text-end"
                          >
                            {[m.phone, m.email].filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-xs text-stone-600">
                            {interpolate(g.linkedStudents, {
                              count: formatNumber(m.linkedStudents, locale),
                            })}
                          </p>
                        </div>
                        {m.alreadyLinked && <Badge tone="success">{g.alreadyLinked}</Badge>}
                      </div>
                      {!m.alreadyLinked && (
                        <AdminForm
                          action={linkGuardianAction}
                          locale={locale}
                          hidden={{ studentId: student.id, guardianId: m.id }}
                          messages={t.admin.errors}
                          fieldMessages={t.admin.fieldErrors}
                          submit={g.link}
                          submitting={t.admin.common.saving}
                          submitVariant="secondary"
                          className="mt-3"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              name="relationship"
                              label={t.admin.fields.relationship}
                              hint={t.admin.fields.relationshipHint}
                              optional={t.admin.common.optional}
                              maxLength={40}
                            />
                            <Checkbox
                              name="isPrimaryContact"
                              label={t.admin.fields.primaryContact}
                            />
                          </div>
                        </AdminForm>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>

        <Section title={g.newTitle}>
          <AdminForm
            action={addGuardianAction}
            locale={locale}
            hidden={{ studentId: student.id }}
            messages={t.admin.errors}
            fieldMessages={t.admin.fieldErrors}
            submit={g.submit}
            submitting={t.admin.common.saving}
          >
            <FieldGroup title={g.newTitle} description={g.newHint}>
              <GuardianFields t={t} primaryInitial={profile.guardians.length === 0} />
            </FieldGroup>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
