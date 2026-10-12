import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/page-parts";
import { PortalFrame } from "@/components/layout/portal-frame";
import { SheetCard } from "@/components/portal/sheet-card";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { portalResults } from "@/server/portal/queries";
import { requireStudent } from "@/server/student-auth/current";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/results">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].portal.results } : {};
}

/** Every published sheet of the signed-in student, grouped by session, newest first. */
export default async function PortalResultsPage() {
  const { locale, t } = await getDictionary();
  const session = await requireStudent(locale);
  const sheets = await portalResults(getDb(), session);
  const groups = new Map<string, typeof sheets>();
  for (const sheet of sheets)
    groups.set(sheet.sessionLabel, [...(groups.get(sheet.sessionLabel) ?? []), sheet]);

  return (
    <PortalFrame locale={locale} t={t}>
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">{t.portal.results}</h1>
      <p className="mt-2 text-charcoal-700">{t.portal.resultsIntro}</p>
      <div className="mt-8 flex flex-col gap-8">
        {sheets.length === 0 ? (
          <EmptyState title={t.portal.noResults} />
        ) : (
          [...groups].map(([label, rows]) => (
            <section key={label} aria-labelledby={`s-${label}`}>
              <h2
                id={`s-${label}`}
                dir="ltr"
                className="mb-3 text-start text-lg font-semibold text-brand-950 tabular-nums rtl:text-end"
              >
                {label}
              </h2>
              <ul className="flex flex-col gap-3">
                {rows.map((sheet) => (
                  <li key={sheet.sheetId}>
                    <SheetCard locale={locale} t={t} sheet={sheet} showSession={false} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </PortalFrame>
  );
}
