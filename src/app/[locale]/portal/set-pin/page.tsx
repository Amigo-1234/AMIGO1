import type { Metadata } from "next";
import { SetPinForm } from "@/components/auth/set-pin-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { requireStudent } from "@/server/student-auth/current";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/set-pin">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].auth.setPin.title } : {};
}

/** Reachable only from the short session created by signing in with a migrated V1 password. */
export default async function SetPinPage() {
  const { locale, t } = await getDictionary();
  await requireStudent(locale, { pinSetup: true });
  const s = t.auth.setPin;
  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <SetPinForm
        locale={locale}
        messages={{
          newPin: s.newPin,
          confirmPin: s.confirmPin,
          hint: t.auth.student.pinHint,
          submit: s.submit,
          submitting: s.submitting,
          errors: {
            invalid_pin: s.invalidPin,
            mismatch: s.mismatch,
            session_invalid: s.sessionInvalid,
            not_configured: t.auth.notConfigured,
            server: t.auth.serverError,
          },
        }}
      />
    </AuthShell>
  );
}
