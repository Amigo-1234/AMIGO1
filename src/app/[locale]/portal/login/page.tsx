import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReasonNotice } from "@/components/auth/reason-notice";
import { StudentLoginForm } from "@/components/auth/student-login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { Notice } from "@/components/ui/notice";
import { getDb } from "@/db/client";
import { EXAMPLE_STUDENT_ID } from "@/lib/brand";
import { getServerEnv } from "@/lib/env";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";
import { getCurrentStudent } from "@/server/student-auth/current";
import { isLegacyLoginEnabled } from "@/server/student-auth/service";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].auth.student.title } : {};
}

export default async function StudentLoginPage({
  searchParams,
}: PageProps<"/[locale]/portal/login">) {
  const { locale, t } = await getDictionary();
  const s = t.auth.student;
  const env = getServerEnv();
  const configured = !!(env.DATABASE_URL && env.STUDENT_AUTH_SECRET);

  if (configured && (await getCurrentStudent())) redirect(localizedPath(locale, "/portal"));
  const legacyEnabled = configured ? await isLegacyLoginEnabled(getDb()) : false;
  const { reason } = await searchParams;

  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <ReasonNotice
        reason={reason}
        messages={{
          expired: { text: t.auth.sessionExpired, tone: "warning" },
          signed_out: { text: t.auth.signedOut, tone: "info" },
        }}
      />
      {configured ? (
        <StudentLoginForm
          locale={locale}
          legacyEnabled={legacyEnabled}
          messages={{
            studentId: s.studentId,
            studentIdHint: interpolate(s.studentIdHint, { example: EXAMPLE_STUDENT_ID }),
            pin: s.pin,
            pinHint: legacyEnabled ? s.pinHintLegacy : s.pinHint,
            submit: s.submit,
            submitting: t.auth.submitting,
            errors: {
              invalid_input: s.invalidInput,
              invalid_credentials: s.invalidCredentials,
              throttled: t.auth.throttled,
              unavailable: s.unavailable,
              not_configured: t.auth.notConfigured,
              server: t.auth.serverError,
            },
          }}
        />
      ) : (
        <Notice>{t.auth.notConfigured}</Notice>
      )}
    </AuthShell>
  );
}
