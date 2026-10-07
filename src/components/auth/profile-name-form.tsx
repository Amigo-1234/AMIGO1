"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { Locale } from "@/i18n/config";
import { type ProfileNameState, updateOwnNameAction } from "@/server/staff-auth/actions";
import { SubmitButton } from "./submit-button";

export type ProfileNameMessages = {
  label: string;
  hint: string;
  submit: string;
  submitting: string;
  errors: Record<NonNullable<ProfileNameState["error"]>, string>;
};

/** Lets signed-in staff correct their own display name. */
export function ProfileNameForm({
  locale,
  currentName,
  messages,
}: {
  locale: Locale;
  currentName: string;
  messages: ProfileNameMessages;
}) {
  const [state, formAction] = useActionState(updateOwnNameAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      {state.error && <Notice tone="danger">{messages.errors[state.error]}</Notice>}
      <TextField
        id="profile-name"
        name="fullName"
        label={messages.label}
        hint={messages.hint}
        defaultValue={state.fullName ?? currentName}
        // Not "name": contact AutoFill would offer the device owner's contact-card name.
        autoComplete="off"
        required
        maxLength={120}
      />
      <SubmitButton
        label={messages.submit}
        pendingLabel={messages.submitting}
        variant="secondary"
        size="md"
        block={false}
      />
    </form>
  );
}
