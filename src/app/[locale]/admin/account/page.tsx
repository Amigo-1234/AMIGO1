import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-parts";
import { ProfileNameForm } from "@/components/auth/profile-name-form";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { requireStaff } from "@/server/staff-auth/current";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/account">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: dictionaries[locale].admin.account.title } : {};
}

/** The signed-in staff member's own account: name, roles and effective permissions. */
export default async function AccountPage({ searchParams }: PageProps<"/[locale]/admin/account">) {
  const { locale, t } = await getDictionary();
  const access = await requireStaff(locale);
  const { name } = await searchParams;
  const a = t.admin.account;
  const permissions = [...access.permissions].sort();

  return (
    <>
      <PageHeader
        title={a.title}
        description={
          <span dir="ltr" className="inline-block">
            {access.email}
          </span>
        }
      />
      {name === "saved" && (
        <Notice tone="info" className="mb-6">
          {t.admin.nameSaved}
        </Notice>
      )}
      <div className="grid gap-4">
        <Section title={t.admin.nameTitle}>
          <ProfileNameForm
            locale={locale}
            currentName={access.fullName}
            messages={{
              label: t.admin.nameTitle,
              hint: t.admin.nameHint,
              submit: t.admin.nameSave,
              submitting: t.admin.nameSaving,
              errors: { invalid_input: t.admin.nameInvalid, server: t.auth.serverError },
            }}
          />
        </Section>
        <Section title={a.roles}>
          {access.roles.length ? (
            <ul className="flex flex-wrap gap-2">
              {access.roles.map((role) => (
                <li key={role.key}>
                  <Badge tone="success">{locale === "ar" ? role.nameAr : role.nameEn}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-charcoal-700">{a.noRoles}</p>
          )}
        </Section>
        <Section
          title={`${a.permissions} · ${interpolate(a.permissionCount, { count: permissions.length })}`}
        >
          <ul dir="ltr" className="flex flex-wrap gap-1.5">
            {permissions.map((permission) => (
              <li key={permission}>
                <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 text-xs text-charcoal-700">
                  {permission}
                </code>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
