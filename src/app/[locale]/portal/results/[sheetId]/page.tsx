import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowBackIcon } from "@/components/icons";
import { PortalFrame } from "@/components/layout/portal-frame";
import { PrintButton } from "@/components/results/print-button";
import { ResultSheet } from "@/components/results/result-sheet";
import { isUuid } from "@/domain/admin-input";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { publishedSheetsFor } from "@/server/results/read";
import { requireStudent } from "@/server/student-auth/current";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/results/[sheetId]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].sheet.title } : {};
}

/**
 * One published result sheet. The sheet is looked up only among the signed-in student's
 * own visible sheets, so another student's ID, a draft or an unpublished class is a 404.
 */
export default async function PortalResultPage({
  params,
}: PageProps<"/[locale]/portal/results/[sheetId]">) {
  const { locale, t } = await getDictionary();
  const session = await requireStudent(locale);
  const { sheetId } = await params;
  if (!isUuid(sheetId)) notFound();
  const sheet = (await publishedSheetsFor(getDb(), session)).find((s) => s.sheetId === sheetId);
  if (!sheet) notFound();

  return (
    <PortalFrame locale={locale} t={t}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={localizedPath(locale, "/portal")}
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-800 hover:text-brand-950"
        >
          <ArrowBackIcon className="size-4 rtl:-scale-x-100" />
          {t.portal.backToResults}
        </Link>
        <PrintButton label={t.sheet.print} />
      </div>
      <ResultSheet locale={locale} t={t} student={session.student} sheet={sheet} />
    </PortalFrame>
  );
}
