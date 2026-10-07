import type { Metadata } from "next";
import { isLocale } from "@/i18n/config";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DetailList,
  DoneNotice,
  PageHeader,
  Section,
  StudentStatusBadge,
} from "@/components/admin/page-parts";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { isUuid } from "@/domain/admin-input";
import { allowedStatusChanges } from "@/domain/student-lifecycle";
import { getDb } from "@/db/client";
import { type Dictionary, dictionaries } from "@/i18n/dictionaries";
import { formatDate, formatDay, formatNumber, interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { getStudentProfile, studentActivity } from "@/server/admin/queries";
import { hasPermission } from "@/server/staff-auth/access";
import { requireStaffPermission } from "@/server/staff-auth/current";
import { canSignIn } from "@/server/student-auth/rules";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/students/[id]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.profile.title } : {};
}

type Activity = Awaited<ReturnType<typeof studentActivity>>[number];

function activityDetail(entry: Activity, t: Dictionary): string | null {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  const status = t.admin.studentStatus as Record<string, string>;
  if (
    entry.action === "student.status_changed" &&
    typeof m.from === "string" &&
    typeof m.to === "string"
  )
    return `${status[m.from] ?? m.from} → ${status[m.to] ?? m.to}${m.reason ? ` · ${String(m.reason)}` : ""}`;
  if (entry.action === "enrollment.level_changed")
    return `${String(m.from ?? "")} → ${String(m.to ?? "")}${m.reason ? ` · ${String(m.reason)}` : ""}`;
  if (entry.action === "enrollment.created")
    return `${String(m.session ?? "")} · ${String(m.level ?? "")}`;
  if (entry.action === "student.created" && typeof m.publicId === "string") return m.publicId;
  if (entry.action === "guardian.unlinked" && m.reason) return String(m.reason);
  return null;
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/students/[id]">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, "students.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const profile = await getStudentProfile(db, id);
  if (!profile) notFound();
  const { done } = await searchParams;

  const p = t.admin.profile;
  const { student } = profile;
  const archived = student.status === "archived";
  const can = (permission: Parameters<typeof hasPermission>[1]) =>
    hasPermission(access, permission);
  const base = localizedPath(locale, `/admin/students/${student.id}`);
  const activity = can("audit.read") ? await studentActivity(db, student.id) : null;
  const levelName = (row: { levelNameEn: string; levelNameAr: string }) =>
    locale === "ar" ? row.levelNameAr : row.levelNameEn;
  const day = (value: string | null) => formatDay(value, locale);
  const current = profile.activeEnrollment;

  return (
    <>
      <PageHeader
        back={{ href: localizedPath(locale, "/admin/students"), label: t.admin.students.title }}
        eyebrow={
          <span dir="ltr" className="tracking-normal normal-case tabular-nums">
            {student.publicId}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="user-text">{student.fullName}</span>
            <StudentStatusBadge status={student.status} t={t} />
          </span>
        }
        actions={
          <>
            {can("students.update") && !archived && (
              <ButtonLink href={`${base}/edit`} variant="secondary">
                {p.editDetails}
              </ButtonLink>
            )}
            {can("students.archive") &&
              (archived ? (
                <ButtonLink href={`${base}/status`} variant="secondary">
                  {p.restore}
                </ButtonLink>
              ) : (
                allowedStatusChanges(student.status).length > 0 && (
                  <ButtonLink href={`${base}/status`} variant="secondary">
                    {p.changeStatus}
                  </ButtonLink>
                )
              ))}
          </>
        }
      />
      <DoneNotice code={done} t={t} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Section title={p.identity} id="identity">
            <DetailList
              emptyLabel={t.admin.common.none}
              rows={[
                {
                  label: t.admin.fields.gender,
                  value: student.gender ? t.admin.gender[student.gender] : null,
                },
                { label: t.admin.fields.dateOfBirth, value: day(student.dateOfBirth) },
                { label: t.admin.fields.phone, value: student.phone, ltr: true },
                { label: t.admin.fields.admittedOn, value: day(student.admittedOn) },
                { label: t.admin.fields.address, value: student.address },
                { label: t.admin.fields.notes, value: student.notes },
              ]}
            />
          </Section>

          <Section
            title={p.enrollment}
            id="enrollment"
            actions={
              can("enrollments.manage") && !archived ? (
                <ButtonLink href={`${base}/placement`} variant="secondary">
                  {current ? p.correctLevel : p.place}
                </ButtonLink>
              ) : undefined
            }
          >
            <div className="rounded-md border border-brand-100 bg-brand-50 px-4 py-3">
              <p className="text-sm text-brand-800">{p.currentClass}</p>
              {current ? (
                <p className="mt-0.5 text-lg font-semibold text-brand-950">
                  {levelName(current)} <span className="text-stone-600">({current.levelCode})</span>
                  {/* The margin sits outside the LTR span so it follows the page direction. */}
                  <span className="ms-2 text-base font-normal text-charcoal-700 tabular-nums">
                    <span dir="ltr">{current.sessionLabel}</span>
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 font-semibold text-charcoal-700">{p.notPlaced}</p>
              )}
            </div>
            {profile.enrollments.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-sm font-semibold text-stone-600">{p.history}</h3>
                <ul className="divide-y divide-stone-200">
                  {profile.enrollments.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                    >
                      <span>
                        <span dir="ltr" className="font-semibold text-charcoal-900 tabular-nums">
                          {e.sessionLabel}
                        </span>
                        <span className="ms-2 text-charcoal-700">
                          {levelName(e)} ({e.levelCode})
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                        {[day(e.enrolledOn), day(e.endedOn)].filter(Boolean).join(" – ")}
                        <Badge
                          tone={
                            e.status === "active"
                              ? "success"
                              : e.status === "withdrawn"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {t.admin.enrollmentStatus[e.status]}
                        </Badge>
                        {e.source === "v1_import" && <Badge>{t.admin.common.v1Import}</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section
            title={p.guardians}
            id="guardians"
            actions={
              can("students.update") && !archived ? (
                <ButtonLink href={`${base}/guardians/new`} variant="secondary">
                  {p.addGuardian}
                </ButtonLink>
              ) : undefined
            }
          >
            {profile.guardians.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {profile.guardians.map((g) => (
                  <li key={g.id} className="rounded-md border border-stone-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="user-text font-semibold text-charcoal-900">{g.fullName}</p>
                        {g.relationship && (
                          <p className="text-sm text-charcoal-700">{g.relationship}</p>
                        )}
                      </div>
                      {can("students.update") && !archived && (
                        <Link
                          href={`${base}/guardians/${g.id}`}
                          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
                        >
                          {p.editGuardian}
                        </Link>
                      )}
                    </div>
                    {g.isPrimaryContact && (
                      <Badge tone="accent" className="mt-2">
                        {p.primaryContact}
                      </Badge>
                    )}
                    <dl className="mt-2 grid gap-1 text-sm">
                      {g.phone && (
                        <dd dir="ltr" className="text-start text-charcoal-900 rtl:text-end">
                          <a href={`tel:${g.phone}`} className="hover:underline">
                            {g.phone}
                          </a>
                        </dd>
                      )}
                      {g.email && (
                        <dd
                          dir="ltr"
                          className="truncate text-start text-charcoal-900 rtl:text-end"
                        >
                          {g.email}
                        </dd>
                      )}
                    </dl>
                    {g.linkedStudents > 1 && (
                      <p className="mt-2 text-xs text-stone-600">
                        {interpolate(p.sharedWith, {
                          count: formatNumber(g.linkedStudents - 1, locale),
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-charcoal-700">{p.noGuardians}</p>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section title={p.studentIds} id="ids">
            <ul className="flex flex-col gap-2">
              {profile.identifiers.map((identifier) => (
                <li
                  key={identifier.value}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span dir="ltr" className="font-semibold text-charcoal-900 tabular-nums">
                    {identifier.value}
                  </span>
                  <Badge tone={identifier.isPrimary ? "success" : "neutral"}>
                    {identifier.isPrimary ? p.primaryId : p.alias}
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={p.signIn} id="sign-in">
            <ul className="flex flex-col gap-2 text-sm text-charcoal-700">
              {!canSignIn(student.status) && (
                <li className="text-warning-700">
                  {interpolate(p.signInBlocked, { status: t.admin.studentStatus[student.status] })}
                </li>
              )}
              {profile.signIn.pin ? (
                <li>
                  {interpolate(p.pinSet, {
                    date: formatDate(profile.signIn.pin.createdAt, locale),
                  })}
                  {" · "}
                  {profile.signIn.pin.lastUsedAt
                    ? interpolate(p.pinLastUsed, {
                        date: formatDate(profile.signIn.pin.lastUsedAt, locale),
                      })
                    : p.pinNeverUsed}
                </li>
              ) : (
                <li>{p.noPin}</li>
              )}
              {profile.signIn.legacy && <li>{p.legacyActive}</li>}
              {profile.signIn.openSessions > 0 && (
                <li>
                  {interpolate(p.openSessions, {
                    count: formatNumber(profile.signIn.openSessions, locale),
                  })}
                </li>
              )}
            </ul>
          </Section>

          <Section title={p.record} id="record">
            <ul className="flex flex-col gap-1.5 text-sm text-charcoal-700">
              <li>
                {student.createdByName
                  ? interpolate(p.registeredBy, {
                      name: student.createdByName,
                      date: formatDate(student.createdAt, locale),
                    })
                  : interpolate(p.registeredOn, { date: formatDate(student.createdAt, locale) })}
              </li>
              <li>{interpolate(p.lastUpdated, { date: formatDate(student.updatedAt, locale) })}</li>
              {student.archivedAt && (
                <li>
                  {interpolate(p.archivedOn, { date: formatDate(student.archivedAt, locale) })}
                </li>
              )}
              {student.source === "v1_import" && (
                <li>
                  <Badge>{t.admin.common.v1Import}</Badge>
                </li>
              )}
            </ul>
          </Section>

          {activity && (
            <Section title={p.activity} id="activity">
              {activity.length ? (
                <ol className="flex flex-col gap-3">
                  {activity.map((entry) => {
                    const labels = t.admin.activity as Record<string, string>;
                    const detail = activityDetail(entry, t);
                    return (
                      <li key={entry.id} className="border-s-2 border-sand-200 ps-3 text-sm">
                        <p className="font-semibold text-charcoal-900">
                          {labels[entry.action] ?? labels.other}
                        </p>
                        {detail && (
                          <p className="user-text break-words text-charcoal-700">{detail}</p>
                        )}
                        <p className="text-stone-600">
                          {formatDate(entry.occurredAt, locale)}
                          {(entry.actorName ?? entry.actorLabel) &&
                            ` · ${interpolate(t.admin.activity.by, { name: entry.actorName ?? entry.actorLabel ?? "" })}`}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-charcoal-700">{p.noActivity}</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
