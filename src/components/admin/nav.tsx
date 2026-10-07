"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };
export type SoonItem = { label: string; icon: ReactNode };

function isCurrent(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Primary admin navigation. Highlights the current section; works on dark brand surfaces. */
export function AdminNavList({
  items,
  soon,
  soonLabel,
  soonTag,
}: {
  items: NavItem[];
  soon: SoonItem[];
  soonLabel: string;
  soonTag: string;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const current = isCurrent(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-ring-on-dark flex min-h-11 items-center gap-3 rounded-md border-s-2 px-3 text-sm font-semibold transition-colors",
                  current
                    ? "border-gold-300 bg-brand-800 text-ivory"
                    : "border-transparent text-brand-100 hover:bg-brand-900 hover:text-ivory",
                )}
              >
                <span className="text-gold-300">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {soon.length > 0 && (
        <div>
          <p className="px-3 text-xs font-semibold tracking-[0.14em] text-brand-200/80 uppercase">
            {soonLabel}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {soon.map((item) => (
              <li
                key={item.label}
                className="flex min-h-10 items-center gap-3 px-3 text-sm text-brand-200/70"
              >
                <span className="opacity-70">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="rounded-sm border border-brand-700 px-1.5 text-[0.7rem] font-semibold text-brand-200">
                  {soonTag}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Phone menu: a disclosure that closes itself after navigating. */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  // The menu is open only on the page where it was opened, so it closes after navigating.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-mobile-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="focus-ring-on-dark inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-ivory hover:bg-brand-900"
      >
        {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
        {label}
      </button>
      <div
        id="admin-mobile-menu"
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 border-b border-brand-800 bg-brand-950 px-4 pt-3 pb-6 shadow-md"
      >
        {children}
      </div>
    </div>
  );
}
