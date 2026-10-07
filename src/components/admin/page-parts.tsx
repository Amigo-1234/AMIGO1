import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ArrowBackIcon } from "@/components/icons";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { type StudentStatus, statusTone } from "@/domain/student-lifecycle";
import type { Dictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Page title block with an optional back link, description and actions. */
export function PageHeader({
  title,
  description,
  back,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-800 hover:text-brand-950"
        >
          <ArrowBackIcon className="size-4 rtl:-scale-x-100" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-gold-700 uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">
            {title}
          </h1>
          {description && <p className="mt-2 max-w-2xl text-charcoal-700">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A titled card section. */
export function Section({
  title,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <section aria-labelledby={headingId}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id={headingId} className="text-base font-semibold text-brand-950">
            {title}
          </h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </section>
    </Card>
  );
}

export function StudentStatusBadge({ status, t }: { status: StudentStatus; t: Dictionary }) {
  return <Badge tone={statusTone(status)}>{t.admin.studentStatus[status]}</Badge>;
}

export function ToneBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

/** Label/value rows. Values that are absent show a quiet "not recorded". */
export function DetailList({
  rows,
  emptyLabel,
}: {
  rows: { label: string; value: ReactNode; ltr?: boolean }[];
  emptyLabel: string;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-sm text-stone-600">{row.label}</dt>
          <dd
            dir={row.ltr ? "ltr" : undefined}
            className={cn(
              "mt-0.5 break-words whitespace-pre-line text-charcoal-900",
              row.ltr ? "text-start rtl:text-end" : "user-text",
            )}
          >
            {row.value ?? <span className="text-stone-500">{emptyLabel}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Calm empty state with the school's mark (ornament is allowed on empty states). */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-sand-300 bg-sand-50/60 px-6 py-10 text-center">
      <BrandMark className="size-10 opacity-80" />
      <p className="text-lg font-semibold text-brand-950">{title}</p>
      {body && <p className="max-w-md text-charcoal-700">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Success message after a redirect (`?done=code`). Unknown codes show nothing. */
export function DoneNotice({ code, t }: { code: string | string[] | undefined; t: Dictionary }) {
  const key = Array.isArray(code) ? code[0] : code;
  const notices = t.admin.notices as Record<string, string>;
  if (!key || !(key in notices)) return null;
  return (
    <Notice className="mb-6" tone="info">
      {notices[key]}
    </Notice>
  );
}

/** A compact statistic. (Its own surface classes: `cn` never merges conflicting utilities.) */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand";
}) {
  const brand = tone === "brand";
  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm sm:p-5",
        brand ? "border-brand-800 bg-brand-900 text-ivory" : "border-stone-200 bg-white",
      )}
    >
      <p className={cn("text-sm", brand ? "text-brand-100" : "text-stone-600")}>{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tabular-nums",
          brand ? "text-ivory" : "text-brand-950",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className={cn("mt-1 text-sm", brand ? "text-gold-200" : "text-charcoal-700")}>{hint}</p>
      )}
    </div>
  );
}
