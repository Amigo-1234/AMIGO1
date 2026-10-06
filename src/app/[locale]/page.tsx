import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";

export default async function HomePage() {
  const { t } = await getDictionary();
  return (
    <main>
      <h1>{BRAND.name}</h1>
      <p lang="ar">{BRAND.nameArabic}</p>
      <p>{t.landing.intro}</p>
    </main>
  );
}
