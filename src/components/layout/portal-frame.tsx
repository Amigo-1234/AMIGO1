import type { ReactNode } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { localizedPath } from "@/i18n/paths";
import { PortalNav } from "./portal-nav";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { studentSignOutAction } from "@/server/student-auth/actions";

/** The signed-in student's page frame: site header with sign-out, section tabs, a column. */
export function PortalFrame({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t: Dictionary;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col print:block">
      <SkipLink label={t.common.skipToContent} />
      <div className="print:hidden">
        <SiteHeader
          locale={locale}
          t={t}
          actions={
            <SignOutForm
              action={studentSignOutAction}
              locale={locale}
              label={t.auth.signOut}
              pendingLabel={t.auth.signingOut}
            />
          }
        />
      </div>
      <PortalNav
        label={t.portal.nav.label}
        items={[
          { href: localizedPath(locale, "/portal"), label: t.portal.nav.overview, exact: true },
          { href: localizedPath(locale, "/portal/results"), label: t.portal.nav.results },
          { href: localizedPath(locale, "/portal/profile"), label: t.portal.nav.profile },
        ]}
      />
      <main
        id="main"
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0"
      >
        {children}
      </main>
    </div>
  );
}
