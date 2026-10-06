import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/staff/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].auth.staff.title } : {};
}

// Layout only: staff authentication (Neon Auth) arrives in Phase 3.
export default async function StaffLoginPage() {
  const { locale, t } = await getDictionary();
  const s = t.auth.staff;

  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <Notice>{t.auth.unavailable}</Notice>
      <form className="mt-6" noValidate>
        <fieldset disabled className="flex flex-col gap-5">
          <TextField
            id="staff-email"
            name="email"
            type="email"
            label={s.email}
            autoComplete="username"
            dir="ltr"
          />
          <TextField
            id="staff-password"
            name="password"
            type="password"
            label={s.password}
            autoComplete="current-password"
            dir="ltr"
          />
          <Button type="submit" size="lg" block>
            {s.submit}
          </Button>
        </fieldset>
      </form>
    </AuthShell>
  );
}
