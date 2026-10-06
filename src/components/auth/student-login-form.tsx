"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { type StudentSignInState, studentSignInAction } from "@/server/student-auth/actions";
import { classifySecret } from "@/server/student-auth/rules";
import { SubmitButton } from "./submit-button";

export type StudentLoginMessages = {
  studentId: string;
  studentIdHint: string;
  pin: string;
  pinHint: string;
  submit: string;
  submitting: string;
  errors: Record<NonNullable<StudentSignInState["error"]>, string>;
};

export function StudentLoginForm({
  locale,
  legacyEnabled,
  messages,
}: {
  locale: Locale;
  legacyEnabled: boolean;
  messages: StudentLoginMessages;
}) {
  const [state, formAction] = useActionState(studentSignInAction, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const error = clientError ?? (state.error ? messages.errors[state.error] : null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const id = String(data.get("studentId") ?? "").trim();
        const secret = String(data.get("pin") ?? "");
        if (!id || !classifySecret(secret, legacyEnabled)) {
          event.preventDefault();
          setClientError(messages.errors.invalid_input);
        } else {
          setClientError(null);
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {error && <Notice tone="danger">{error}</Notice>}
      <TextField
        id="student-id"
        name="studentId"
        label={messages.studentId}
        hint={messages.studentIdHint}
        defaultValue={state.studentId}
        autoComplete="username"
        autoCapitalize="characters"
        spellCheck={false}
        required
        maxLength={40}
        dir="ltr"
      />
      <TextField
        id="student-pin"
        name="pin"
        type="password"
        label={messages.pin}
        hint={messages.pinHint}
        autoComplete="current-password"
        inputMode={legacyEnabled ? "text" : "numeric"}
        maxLength={6}
        required
        dir="ltr"
      />
      <SubmitButton label={messages.submit} pendingLabel={messages.submitting} />
    </form>
  );
}
