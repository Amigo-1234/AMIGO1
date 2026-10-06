import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";

export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="border-t border-stone-200/80">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-stone-600 sm:px-6">
        <p>{interpolate(t.footer.copyright, { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
