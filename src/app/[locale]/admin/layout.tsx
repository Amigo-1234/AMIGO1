import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { requireStaff } from "@/server/staff-auth/current";

// Every admin page depends on the visitor's session, so nothing here is prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale)
    ? {
        title: {
          default: dictionaries[locale].admin.title,
          template: `%s · ${dictionaries[locale].admin.title}`,
        },
        robots: { index: false, follow: false },
      }
    : {};
}

/** Staff workspace. Signed-out or unauthorised visitors are sent to staff sign-in. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  return (
    <AdminShell locale={locale} t={t} access={access}>
      {children}
    </AdminShell>
  );
}
