import type { ReactNode } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { studentSignOutAction } from "@/server/student-auth/actions";

/** The signed-in student's page frame: site header with sign-out, and a narrow column. */
export function PortalFrame({
  locale,
  t,
  children,
  wide = false,
}: {
  locale: Locale;
  t: Dictionary;
  children: ReactNode;
  wide?: boolean;
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
      <main
        id="main"
        className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0 ${wide ? "max-w-4xl" : "max-w-3xl"}`}
      >
        {children}
      </main>
    </div>
  );
}
