import Link from "next/link";
import { getDictionary } from "@/i18n/server";
import { localizedPath } from "@/i18n/paths";

export default async function NotFound() {
  const { locale, t } = await getDictionary();
  return (
    <main>
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.body}</p>
      <Link href={localizedPath(locale)}>{t.notFound.action}</Link>
    </main>
  );
}
