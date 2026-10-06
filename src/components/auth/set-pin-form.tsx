"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { type SetPinState, setNewPinAction } from "@/server/student-auth/actions";
import { isValidPin } from "@/server/student-auth/rules";
import { SubmitButton } from "./submit-button";

export type SetPinMessages = {
  newPin: string;
  confirmPin: string;
  hint: string;
  submit: string;
  submitting: string;
  errors: Record<NonNullable<SetPinState["error"]>, string>;
};

export function SetPinForm({ locale, messages }: { locale: Locale; messages: SetPinMessages }) {
  const [state, formAction] = useActionState(setNewPinAction, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const error = clientError ?? (state.error ? messages.errors[state.error] : null);
  const pinProps = {
    type: "password",
    inputMode: "numeric" as const,
    autoComplete: "new-password",
    maxLength: 6,
    pattern: "[0-9]{6}",
    required: true,
    dir: "ltr" as const,
  };

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const pin = String(data.get("newPin") ?? "");
        const confirm = String(data.get("confirmPin") ?? "");
        const problem = !isValidPin(pin) ? "invalid_pin" : pin !== confirm ? "mismatch" : null;
        if (problem) {
          event.preventDefault();
          setClientError(messages.errors[problem]);
        } else {
          setClientError(null);
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {error && <Notice tone="danger">{error}</Notice>}
      <TextField
        id="new-pin"
        name="newPin"
        label={messages.newPin}
        hint={messages.hint}
        {...pinProps}
      />
      <TextField id="confirm-pin" name="confirmPin" label={messages.confirmPin} {...pinProps} />
      <SubmitButton label={messages.submit} pendingLabel={messages.submitting} />
    </form>
  );
}
