"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type PortalNavItem = { href: string; label: string; exact?: boolean };

/** Section tabs of the student portal; the current one is marked for assistive tech too. */
export function PortalNav({ items, label }: { items: PortalNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-b border-stone-200 bg-white/80 print:hidden">
      <ul className="mx-auto flex max-w-6xl gap-1 px-2 sm:px-4">
        {items.map((item) => {
          const current = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center justify-center border-b-2 px-3 text-sm font-semibold sm:px-4",
                  current
                    ? "border-gold-500 text-brand-950"
                    : "border-transparent text-stone-600 hover:text-brand-800",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
