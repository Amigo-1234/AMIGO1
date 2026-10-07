"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { type SetupState, setupFirstAdminAction } from "@/server/staff-auth/actions";
import { SubmitButton } from "./submit-button";

export type SetupMessages = {
  code: string;
  codeHint: string;
  fullName: string;
  email: string;
  password: string;
  passwordHint: string;
  submit: string;
  submitting: string;
  errors: Record<NonNullable<SetupState["error"]>, string>;
};

export function SetupForm({ locale, messages }: { locale: Locale; messages: SetupMessages }) {
  const [state, formAction] = useActionState(setupFirstAdminAction, {});
  const tone = state.error === "verify_email" ? "warning" : "danger";
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      {state.error && <Notice tone={tone}>{messages.errors[state.error]}</Notice>}
      <TextField
        id="setup-code"
        name="code"
        type="password"
        label={messages.code}
        hint={messages.codeHint}
        autoComplete="off"
        required
        dir="ltr"
      />
      <TextField
        id="setup-name"
        name="fullName"
        label={messages.fullName}
        defaultValue={state.fullName}
        // "off", not "name": iOS contact AutoFill otherwise replaces a typed name with the
        // device owner's contact-card name when the email field is filled.
        autoComplete="off"
        required
        maxLength={120}
      />
      <TextField
        id="setup-email"
        name="email"
        type="email"
        label={messages.email}
        defaultValue={state.email}
        autoComplete="username"
        required
        dir="ltr"
      />
      <TextField
        id="setup-password"
        name="password"
        type="password"
        label={messages.password}
        hint={messages.passwordHint}
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
        dir="ltr"
      />
      <SubmitButton label={messages.submit} pendingLabel={messages.submitting} />
    </form>
  );
}
