import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandLockup } from "@/components/brand/brand-lockup";
import {
  CalendarIcon,
  DashboardIcon,
  ReportIcon,
  ResultsIcon,
  StudentIcon,
  UserIcon,
  WalletIcon,
} from "@/components/icons";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SkipLink } from "@/components/layout/skip-link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { staffSignOutAction } from "@/server/staff-auth/actions";
import { type StaffAccess, hasPermission } from "@/server/staff-auth/access";
import { AdminNavList, MobileMenu, type NavItem } from "./nav";

/**
 * The staff workspace frame: a deep-emerald sidebar on large screens (on the reading
 * start side, so it moves to the right in Arabic) and a top bar with a menu on phones.
 * Navigation only lists sections the staff member may open; future modules are shown as
 * disabled labels, never as links to empty screens.
 */
export function AdminShell({
  locale,
  t,
  access,
  children,
}: {
  locale: Locale;
  t: Dictionary;
  access: StaffAccess;
  children: ReactNode;
}) {
  const n = t.admin.nav;
  const href = (path: string) => localizedPath(locale, path);
  const items: NavItem[] = [
    {
      href: href("/admin"),
      label: n.dashboard,
      icon: <DashboardIcon className="size-5" />,
      exact: true,
    },
  ];
  if (hasPermission(access, "students.read"))
    items.push({
      href: href("/admin/students"),
      label: n.students,
      icon: <StudentIcon className="size-5" />,
    });
  if (hasPermission(access, "students.read") || hasPermission(access, "sessions.manage"))
    items.push({
      href: href("/admin/academics"),
      label: n.academics,
      icon: <CalendarIcon className="size-5" />,
    });
  items.push({
    href: href("/admin/account"),
    label: n.account,
    icon: <UserIcon className="size-5" />,
  });
  const soon = [
    { label: n.results, icon: <ResultsIcon className="size-5" /> },
    { label: n.finance, icon: <WalletIcon className="size-5" /> },
    { label: n.reports, icon: <ReportIcon className="size-5" /> },
  ];
  const roleName = access.roles[0]
    ? locale === "ar"
      ? access.roles[0].nameAr
      : access.roles[0].nameEn
    : null;

  const identity = (
    <div className="border-t border-brand-800 pt-4">
      <p className="text-xs text-brand-200">{n.signedInAs}</p>
      <p className="mt-0.5 truncate font-semibold text-ivory">{access.fullName}</p>
      {roleName && <p className="text-sm text-gold-300">{roleName}</p>}
      <p dir="ltr" className="truncate text-start text-xs text-brand-200 rtl:text-end">
        {access.email}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LanguageSwitcher locale={locale} label={t.common.language} tone="light" />
        <SignOutForm
          action={staffSignOutAction}
          locale={locale}
          label={t.auth.signOut}
          pendingLabel={t.auth.signingOut}
        />
      </div>
    </div>
  );
  const nav = <AdminNavList items={items} soon={soon} soonLabel={n.later} soonTag={n.soon} />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <SkipLink label={t.common.skipToContent} />
      {/* Phones and tablets: top bar with a menu. */}
      <header className="relative z-20 flex items-center justify-between gap-3 bg-brand-950 px-4 py-2 lg:hidden">
        <Link href={href("/admin")} className="focus-ring-on-dark rounded-md py-1">
          <BrandLockup locale={locale} tone="light" />
        </Link>
        <MobileMenu label={n.menu}>
          <nav aria-label={n.label}>{nav}</nav>
          <div className="mt-6">{identity}</div>
        </MobileMenu>
      </header>
      {/* Large screens: persistent sidebar. */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-brand-950 px-4 py-6 lg:flex">
        <Link href={href("/admin")} className="focus-ring-on-dark rounded-md px-2">
          <BrandLockup locale={locale} tone="light" />
        </Link>
        <nav aria-label={n.label} className="flex-1">
          {nav}
        </nav>
        {identity}
      </aside>
      <main id="main" className="min-w-0 px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
