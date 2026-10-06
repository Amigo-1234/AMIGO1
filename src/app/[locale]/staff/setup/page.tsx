import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getDb } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { isBootstrapAvailable } from "@/server/staff-auth/bootstrap";
import { getNeonAuth } from "@/server/staff-auth/neon-config";

// Depends on the visitor's session cookies, so it is rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/staff/setup">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale)
    ? { title: dictionaries[locale].auth.setup.title, robots: { index: false, follow: false } }
    : {};
}

/**
 * One-time first Super Admin setup. Exists only while Neon Auth and STAFF_BOOTSTRAP_TOKEN
 * are configured and no staff record exists; otherwise it is a 404 for everyone.
 */
export default async function StaffSetupPage() {
  const env = getServerEnv();
  if (!getNeonAuth() || !env.STAFF_BOOTSTRAP_TOKEN || !env.DATABASE_URL) notFound();
  if (!(await isBootstrapAvailable(getDb()))) notFound();

  const { locale, t } = await getDictionary();
  const s = t.auth.setup;
  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <SetupForm
        locale={locale}
        messages={{
          code: s.code,
          codeHint: s.codeHint,
          fullName: s.fullName,
          email: s.email,
          password: s.password,
          passwordHint: s.passwordHint,
          submit: s.submit,
          submitting: s.submitting,
          errors: {
            invalid_input: s.invalidInput,
            invalid_code: s.invalidCode,
            verify_email: s.verifyEmail,
            account_error: s.accountError,
            throttled: t.auth.throttled,
            closed: s.closed,
            server: t.auth.serverError,
          },
        }}
      />
    </AuthShell>
  );
}
