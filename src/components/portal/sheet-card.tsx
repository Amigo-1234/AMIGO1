import Link from "next/link";
import { ChevronForwardIcon } from "@/components/icons";
import { englishOrdinal } from "@/domain/results";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import type { StudentSheet } from "@/server/results/queries";
import { cn } from "@/lib/cn";

/** One published sheet as a link card, with the server-computed summary. */
export function SheetCard({
  locale,
  t,
  sheet,
  showSession = true,
}: {
  locale: Locale;
  t: Dictionary;
  sheet: StudentSheet;
  showSession?: boolean;
}) {
  const ar = locale === "ar";
  const s = t.sheet;
  const num = (n: number) => formatNumber(n, locale);
  const passed = sheet.summary.passed;
  return (
    <Link
      href={localizedPath(locale, `/portal/results/${sheet.sheetId}`)}
      className="flex min-h-16 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-300 hover:bg-sand-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-charcoal-900">
          {showSession && (
            <>
              <span dir="ltr">{sheet.sessionLabel}</span> ·{" "}
            </>
          )}
          {ar ? sheet.termNameAr : sheet.termNameEn}
        </span>
        <span className="block text-sm text-stone-600">
          {ar ? sheet.levelNameAr : sheet.levelNameEn}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-charcoal-700">
          <span>
            {s.average}:{" "}
            <span className="font-semibold text-brand-950 tabular-nums">
              {sheet.summary.average === null ? "—" : num(sheet.summary.average)}
            </span>
          </span>
          {passed !== null && (
            <span className={cn("font-semibold", passed ? "text-brand-800" : "text-danger-700")}>
              {passed ? s.pass : s.fail}
            </span>
          )}
          {sheet.position !== null && (
            <span>
              {s.position}:{" "}
              <span className="font-semibold tabular-nums">
                {interpolate(s.positionOf, {
                  position: ar ? num(sheet.position) : englishOrdinal(sheet.position),
                  count: num(sheet.ranked),
                })}
              </span>
            </span>
          )}
        </span>
      </span>
      <span className="sr-only">{t.portal.viewResults}</span>
      <ChevronForwardIcon className="size-5 shrink-0 text-stone-400 rtl:-scale-x-100" />
    </Link>
  );
}
