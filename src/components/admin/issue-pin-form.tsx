"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Notice } from "@/components/ui/notice";
import { type IssuePinState, issuePinAction } from "@/server/admin/credential-actions";

/**
 * Issue or reset a student's PIN. The new PIN comes back in the action's response and is
 * shown here once; it lives only in this component's state and is gone when the page is
 * left or reloaded.
 */
export function IssuePinForm({
  locale,
  studentId,
  doneHref,
  strings,
}: {
  locale: string;
  studentId: string;
  doneHref: string;
  strings: {
    confirm: string;
    confirmRequired: string;
    submit: string;
    submitting: string;
    issuedTitle: string;
    resetTitle: string;
    issuedBody: string;
    pinLabel: string;
    done: string;
    errors: Record<string, string>;
  };
}) {
  const [state, action] = useActionState<IssuePinState, FormData>(issuePinAction, {});
  const id = useId();

  if (state.pin)
    return (
      <div className="flex flex-col gap-4" role="status">
        <Notice tone="info">{state.reset ? strings.resetTitle : strings.issuedTitle}</Notice>
        <div className="rounded-lg border-2 border-gold-300 bg-sand-50 p-5 text-center">
          <p className="text-sm text-stone-600">{strings.pinLabel}</p>
          <p
            dir="ltr"
            className="mt-1 font-mono text-4xl font-semibold tracking-[0.35em] text-brand-950 tabular-nums"
          >
            {state.pin}
          </p>
        </div>
        <p className="text-sm text-charcoal-700">{strings.issuedBody}</p>
        <Link
          href={doneHref}
          className="inline-flex min-h-11 items-center self-start rounded-md bg-brand-800 px-4 text-sm font-semibold text-ivory hover:bg-brand-900"
        >
          {strings.done}
        </Link>
      </div>
    );

  const confirmError = state.fieldErrors?.confirm ? strings.confirmRequired : null;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="studentId" value={studentId} />
      {state.error && state.error !== "invalid" && (
        <Notice tone="danger">{strings.errors[state.error] ?? strings.errors.server}</Notice>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-confirm`} className="flex min-h-11 items-start gap-3">
          <input
            id={`${id}-confirm`}
            type="checkbox"
            name="confirm"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? `${id}-confirm-error` : undefined}
            className="mt-1 size-5 shrink-0 accent-brand-800"
          />
          <span className="text-charcoal-900">{strings.confirm}</span>
        </label>
        {confirmError && (
          <p id={`${id}-confirm-error`} className="ms-8 text-sm font-medium text-danger-700">
            {confirmError}
          </p>
        )}
      </div>
      <div>
        <SubmitButton
          label={strings.submit}
          pendingLabel={strings.submitting}
          size="md"
          block={false}
        />
      </div>
    </form>
  );
}
