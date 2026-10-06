import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const { locale, t } = await getDictionary();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader locale={locale} t={t} />
      <main
        id="main"
        className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      >
        <p className="text-5xl font-semibold text-gold-500" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-brand-950">{t.notFound.title}</h1>
        <p className="mt-2 text-charcoal-700">{t.notFound.body}</p>
        <OrnamentDivider className="my-8 w-40" />
        <ButtonLink href={localizedPath(locale)} variant="secondary">
          {t.notFound.action}
        </ButtonLink>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
