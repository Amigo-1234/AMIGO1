import type { Metadata } from "next";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { staffSignOutAction } from "@/server/staff-auth/actions";
import { requireStaff } from "@/server/staff-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale)
    ? { title: dictionaries[locale].admin.title, robots: { index: false } }
    : {};
}

/** Minimal authenticated staff shell proving authentication and authorization; Phase 5 builds the dashboard. */
export default async function AdminPage({ searchParams }: PageProps<"/[locale]/admin">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  const { denied } = await searchParams;
  const permissions = [...access.permissions].sort();

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t.common.skipToContent} />
      <SiteHeader
        locale={locale}
        t={t}
        actions={
          <SignOutForm
            action={staffSignOutAction}
            locale={locale}
            label={t.auth.signOut}
            pendingLabel={t.auth.signingOut}
          />
        }
      />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        {denied && (
          <Notice tone="warning" className="mb-6">
            {t.admin.denied}
          </Notice>
        )}
        <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">
          {t.admin.title}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">
          {access.fullName}
        </h1>
        <p className="mt-1 text-charcoal-700">
          {t.admin.signedInAs}{" "}
          <span dir="ltr" className="font-medium">
            {access.email}
          </span>
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-stone-600">{t.admin.roles}</h2>
            {access.roles.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {access.roles.map((role) => (
                  <li key={role.key}>
                    <Badge tone="success">{locale === "ar" ? role.nameAr : role.nameEn}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-charcoal-700">{t.admin.noRoles}</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-stone-600">
              {t.admin.permissions} ·{" "}
              {interpolate(t.admin.permissionCount, { count: permissions.length })}
            </h2>
            <ul dir="ltr" className="mt-3 flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <li key={permission}>
                  <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 text-xs text-charcoal-700">
                    {permission}
                  </code>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <p className="mt-8 text-charcoal-700">{t.admin.comingSoon}</p>
      </main>
    </div>
  );
}
