import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StudentStatusBadge } from "@/components/admin/page-parts";
import { ChevronForwardIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClasses } from "@/components/ui/field";
import { parseDirectoryQuery } from "@/domain/admin-input";
import { STUDENT_STATUSES } from "@/domain/student-lifecycle";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { listLevels, listStudents } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.students.title } : {};
}

/**
 * Student directory. Search, filters and pagination are plain GET parameters handled in
 * the database, so only one page of students (25) ever reaches the browser, and every
 * view has a shareable URL.
 */
export default async function StudentsPage({
  searchParams,
}: PageProps<"/[locale]/admin/students">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "students.read");
  const s = t.admin.students;
  const params = await searchParams;
  const query = parseDirectoryQuery(params);
  const db = getDb();
  const [result, levels] = await Promise.all([listStudents(db, query), listLevels(db)]);
  const base = localizedPath(locale, "/admin/students");
  const filtered = !!query.q || query.status !== "current" || !!query.levelId;
  const canCreate = hasPermission(access, "students.create");
  const levelName = (row: { levelNameEn: string | null; levelNameAr: string | null }) =>
    locale === "ar" ? row.levelNameAr : row.levelNameEn;

  const pageHref = (page: number) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.status !== "current") search.set("status", query.status);
    if (query.levelId) search.set("level", query.levelId);
    if (page > 1) search.set("page", String(page));
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };
  const studentHref = (id: string) => `${base}/${id}`;

  return (
    <>
      <PageHeader
        title={s.title}
        actions={
          canCreate ? (
            <ButtonLink href={`${base}/new`}>
              <PlusIcon className="size-4" />
              {s.register}
            </ButtonLink>
          ) : undefined
        }
      />

      <Card className="mb-4 p-4">
        <form
          method="get"
          action={base}
          role="search"
          className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-start"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="text-sm font-semibold text-charcoal-900">
              {s.search}
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ""}
                aria-describedby="q-hint"
                maxLength={80}
                autoComplete="off"
                className={cn(inputClasses, "ps-9")}
              />
            </div>
            <p id="q-hint" className="text-sm text-stone-600">
              {s.searchHint}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-sm font-semibold text-charcoal-900">
              {s.status}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={query.status}
              className={cn(inputClasses, "appearance-auto")}
            >
              <option value="current">{s.current}</option>
              {STUDENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.admin.studentStatus[status]}
                </option>
              ))}
              <option value="all">{s.all}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="level" className="text-sm font-semibold text-charcoal-900">
              {s.level}
            </label>
            <select
              id="level"
              name="level"
              defaultValue={query.levelId ?? ""}
              className={cn(inputClasses, "appearance-auto")}
            >
              <option value="">{s.allLevels}</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {locale === "ar" ? level.nameAr : level.nameEn} ({level.code})
                </option>
              ))}
            </select>
          </div>
          {/* Offset by the label height so the buttons line up with the fields. */}
          <div className="flex gap-2 md:mt-6.5">
            <button type="submit" className={buttonClasses()}>
              {s.apply}
            </button>
            {filtered && (
              <Link href={base} className={buttonClasses({ variant: "ghost" })}>
                {s.clear}
              </Link>
            )}
          </div>
        </form>
      </Card>

      <p role="status" className="mb-3 text-sm text-stone-600">
        {interpolate(s.results, { count: formatNumber(result.total, locale) })}
      </p>

      {result.total === 0 ? (
        filtered ? (
          <EmptyState
            title={s.noMatches}
            action={
              <ButtonLink href={base} variant="secondary">
                {s.clear}
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            title={s.emptyTitle}
            body={s.emptyBody}
            action={
              canCreate ? <ButtonLink href={`${base}/new`}>{s.register}</ButtonLink> : undefined
            }
          />
        )
      ) : (
        <>
          {/* Wide screens: a table. */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-stone-200 bg-sand-50 text-stone-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {s.name}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {s.studentId}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {s.class}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {s.status}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-sand-50">
                    <td className="px-4 py-3">
                      <Link
                        href={studentHref(row.id)}
                        className="font-semibold text-brand-900 hover:underline"
                      >
                        <span className="user-text">{row.fullName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span dir="ltr">{row.publicId}</span>
                    </td>
                    <td className="px-4 py-3 text-charcoal-700">
                      {row.levelCode ? (
                        <>
                          {levelName(row)} <span className="text-stone-500">({row.levelCode})</span>
                        </>
                      ) : (
                        <span className="text-stone-500">{s.notPlaced}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StudentStatusBadge status={row.status} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {/* Phones: one tappable card per student. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={studentHref(row.id)}
                  className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm active:bg-sand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-brand-900">
                      <span className="user-text">{row.fullName}</span>
                    </span>
                    <span
                      dir="ltr"
                      className="block text-start text-sm text-stone-600 tabular-nums rtl:text-end"
                    >
                      {row.publicId}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-sm text-charcoal-700">
                      <StudentStatusBadge status={row.status} t={t} />
                      {row.levelCode ? `${levelName(row)} (${row.levelCode})` : s.notPlaced}
                    </span>
                  </span>
                  <ChevronForwardIcon className="size-5 shrink-0 text-stone-400 rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>

          {result.pages > 1 && (
            <nav aria-label={s.pagination} className="mt-4 flex items-center justify-between gap-3">
              {result.page > 1 ? (
                <Link
                  href={pageHref(result.page - 1)}
                  className={buttonClasses({ variant: "secondary" })}
                >
                  {s.previous}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-stone-600">
                {interpolate(s.page, { page: result.page, pages: result.pages })}
              </span>
              {result.page < result.pages ? (
                <Link
                  href={pageHref(result.page + 1)}
                  className={buttonClasses({ variant: "secondary" })}
                >
                  {s.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
