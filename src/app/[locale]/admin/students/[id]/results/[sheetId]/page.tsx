import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-parts";
import { PrintButton } from "@/components/results/print-button";
import { ResultSheet } from "@/components/results/result-sheet";
import { isUuid } from "@/domain/admin-input";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { loadStudentPage } from "@/server/admin/load";
import { readStudentSheets } from "@/server/results/read";
import { hasPermission } from "@/server/staff-auth/access";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students/[id]/results/[sheetId]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].sheet.title } : {};
}

/** Staff view of one result sheet (drafts included), printable on A4. */
export default async function StaffResultSheetPage({
  params,
}: PageProps<"/[locale]/admin/students/[id]/results/[sheetId]">) {
  const { id, sheetId } = await params;
  const { locale, t, access, db, profile } = await loadStudentPage(id, "students.read");
  if (!hasPermission(access, "results.read")) redirect(localizedPath(locale, "/admin?denied=1"));
  if (!isUuid(sheetId)) notFound();
  const sheet = (await readStudentSheets(db, access, profile.student.id)).find(
    (s) => s.sheetId === sheetId,
  );
  if (!sheet) notFound();

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back={{
            href: localizedPath(locale, `/admin/students/${profile.student.id}`),
            label: profile.student.fullName,
          }}
          title={t.sheet.title}
          actions={<PrintButton label={t.sheet.print} />}
        />
      </div>
      <ResultSheet locale={locale} t={t} student={profile.student} sheet={sheet} staffView />
    </>
  );
}
