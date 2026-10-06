import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";
import type { Locale } from "@/i18n/config";
import { BrandMark } from "./brand-mark";

/**
 * Mark + the school's name in both scripts. The current language's form leads;
 * the other follows smaller. Both carry their own `lang` for correct shaping and fonts.
 */
export function BrandLockup({
  locale,
  tone = "brand",
  compact = false,
  className,
}: {
  locale: Locale;
  tone?: "brand" | "light";
  /** Show only the mark on narrow screens (when the header also carries actions). */
  compact?: boolean;
  className?: string;
}) {
  const names = [
    { text: BRAND.name, lang: "en" },
    { text: BRAND.nameArabic, lang: "ar" },
  ];
  if (locale === "ar") names.reverse();
  const [primary, secondary] = names;

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMark tone={tone} className="size-9" />
      <span
        className={cn(
          "flex-col leading-tight whitespace-nowrap",
          compact ? "hidden sm:flex" : "flex",
        )}
      >
        <span
          lang={primary.lang}
          className={cn(
            "text-[0.95rem] font-semibold tracking-tight",
            tone === "brand" ? "text-brand-900" : "text-ivory",
          )}
        >
          {primary.text}
        </span>
        <span
          lang={secondary.lang}
          className={cn("text-xs", tone === "brand" ? "text-stone-600" : "text-brand-200")}
        >
          {secondary.text}
        </span>
      </span>
    </span>
  );
}
