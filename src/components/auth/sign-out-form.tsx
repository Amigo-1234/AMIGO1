import type { Locale } from "@/i18n/config";
import { SubmitButton } from "./submit-button";

/** Sign-out is a POST to a Server Action (never a GET link), so it cannot be triggered cross-site. */
export function SignOutForm({
  action,
  locale,
  label,
  pendingLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  locale: Locale;
  label: string;
  pendingLabel: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton
        label={label}
        pendingLabel={pendingLabel}
        variant="secondary"
        size="md"
        block={false}
      />
    </form>
  );
}
