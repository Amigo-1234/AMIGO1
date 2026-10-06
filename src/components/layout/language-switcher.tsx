"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobeIcon } from "@/components/icons";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { switchLocalePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

/**
 * Links to the current page in the other language. Each label is written in its own
 * language (so an Arabic reader on the English page still recognises "العربية").
 */
export function LanguageSwitcher({
  locale,
  label,
  tone = "brand",
}: {
  locale: Locale;
  label: string;
  tone?: "brand" | "light";
}) {
  const pathname = usePathname();
  const targets = locales.filter((l) => l !== locale);

  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-1">
        {targets.map((target) => (
          <li key={target}>
            <Link
              href={switchLocalePath(pathname, target)}
              hrefLang={target}
              lang={target}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors",
                tone === "brand"
                  ? "text-brand-800 hover:bg-brand-50"
                  : "focus-ring-on-dark text-ivory hover:bg-white/10",
              )}
            >
              <GlobeIcon className="size-4" />
              {localeNames[target]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
