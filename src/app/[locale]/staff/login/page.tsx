import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReasonNotice } from "@/components/auth/reason-notice";
import { StaffLoginForm } from "@/components/auth/staff-login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { getCurrentStaff } from "@/server/staff-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/staff/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].auth.staff.title } : {};
}

export default async function StaffLoginPage({ searchParams }: PageProps<"/[locale]/staff/login">) {
  const { locale, t } = await getDictionary();
  const s = t.auth.staff;
  const state = await getCurrentStaff();
  if (state.status === "ok") redirect(localizedPath(locale, "/admin"));
  const { reason } = await searchParams;

  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <ReasonNotice
        reason={reason}
        messages={{
          expired: { text: t.auth.sessionExpired, tone: "warning" },
          signed_out: { text: t.auth.signedOut, tone: "info" },
          unmapped: { text: s.unmapped, tone: "danger" },
          inactive: { text: s.inactive, tone: "danger" },
        }}
      />
      {state.status === "not_configured" ? (
        <Notice>{t.auth.notConfigured}</Notice>
      ) : (
        <StaffLoginForm
          locale={locale}
          messages={{
            email: s.email,
            password: s.password,
            submit: s.submit,
            submitting: t.auth.submitting,
            errors: {
              invalid_input: s.invalidInput,
              invalid_credentials: s.invalidCredentials,
              throttled: t.auth.throttled,
              unmapped: s.unmapped,
              inactive: s.inactive,
              not_configured: t.auth.notConfigured,
              server: t.auth.serverError,
            },
          }}
        />
      )}
    </AuthShell>
  );
}
