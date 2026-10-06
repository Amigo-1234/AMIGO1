import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { EXAMPLE_STUDENT_ID } from "@/lib/brand";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].auth.student.title } : {};
}

// Layout only: credential checking arrives with secure student sessions (Phase 3).
export default async function StudentLoginPage() {
  const { locale, t } = await getDictionary();
  const s = t.auth.student;

  return (
    <AuthShell locale={locale} t={t} title={s.title} subtitle={s.subtitle}>
      <Notice>{t.auth.unavailable}</Notice>
      <form className="mt-6" noValidate>
        <fieldset disabled className="flex flex-col gap-5">
          <TextField
            id="student-id"
            name="studentId"
            label={s.studentId}
            hint={interpolate(s.studentIdHint, { example: EXAMPLE_STUDENT_ID })}
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            className="[&_input]:text-start"
          />
          <TextField
            id="student-pin"
            name="pin"
            type="password"
            label={s.pin}
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
