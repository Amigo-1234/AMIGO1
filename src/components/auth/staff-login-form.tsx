"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { type StaffSignInState, staffSignInAction } from "@/server/staff-auth/actions";
import { SubmitButton } from "./submit-button";

export type StaffLoginMessages = {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  errors: Record<NonNullable<StaffSignInState["error"]>, string>;
};

export function StaffLoginForm({
  locale,
  messages,
}: {
  locale: Locale;
  messages: StaffLoginMessages;
}) {
  const [state, formAction] = useActionState(staffSignInAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      {state.error && <Notice tone="danger">{messages.errors[state.error]}</Notice>}
      <TextField
        id="staff-email"
        name="email"
        type="email"
        label={messages.email}
        defaultValue={state.email}
        autoComplete="username"
        required
        maxLength={254}
        dir="ltr"
      />
      <TextField
        id="staff-password"
        name="password"
        type="password"
        label={messages.password}
        autoComplete="current-password"
        required
        maxLength={256}
        dir="ltr"
      />
      <SubmitButton label={messages.submit} pendingLabel={messages.submitting} />
    </form>
  );
}
