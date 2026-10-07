"use client";

import { createContext, type ReactNode, useActionState, useContext, useId } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { AdminFormState } from "@/server/admin/action-support";
import { cn } from "@/lib/cn";

type Action = (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;

type FormContextValue = {
  state: AdminFormState;
  fieldMessages: Record<string, string>;
  /** Unique per form, so several forms on one page never share field ids. */
  formId: string;
};

const FormContext = createContext<FormContextValue>({ state: {}, fieldMessages: {}, formId: "f" });

function useFieldId(name: string) {
  const { formId } = useContext(FormContext);
  return `${formId}-${name.replace(/\W/g, "-")}`;
}

/**
 * A form posting to an admin Server Action. Server-side validation results come back as
 * codes; this shows the general message at the top and each field's message under the
 * field, and refills what was typed. Hidden fields carry the locale and record IDs.
 */
export function AdminForm({
  action,
  locale,
  hidden = {},
  messages,
  fieldMessages,
  submit,
  submitting,
  submitVariant = "primary",
  children,
  className,
}: {
  action: Action;
  locale: string;
  hidden?: Record<string, string>;
  /** Translations for top-level error codes. */
  messages: Record<string, string>;
  /** Translations for field error codes. */
  fieldMessages: Record<string, string>;
  submit: string;
  submitting: string;
  submitVariant?: "primary" | "secondary" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const formId = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const message = state.error ? (messages[state.error] ?? messages.server) : null;
  return (
    <FormContext.Provider value={{ state, fieldMessages, formId }}>
      <form action={formAction} className={cn("flex flex-col gap-5", className)} noValidate>
        <input type="hidden" name="locale" value={locale} />
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {message && <Notice tone="danger">{message}</Notice>}
        {children}
        <div>
          <SubmitButton
            label={submit}
            pendingLabel={submitting}
            variant={submitVariant}
            size="md"
            block={false}
          />
        </div>
      </form>
    </FormContext.Provider>
  );
}

function useField(name: string, initial?: string | null) {
  const { state, fieldMessages } = useContext(FormContext);
  const code = state.fieldErrors?.[name];
  const value = state.values && name in state.values ? state.values[name] : (initial ?? "");
  return { error: code ? (fieldMessages[code] ?? code) : undefined, value };
}

function FieldFrame({
  id,
  label,
  hint,
  error,
  optional,
  wide,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="text-sm font-semibold text-charcoal-900">
        {label}
        {optional && <span className="ms-1 font-normal text-stone-600">({optional})</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

type Common = {
  name: string;
  label: string;
  hint?: string;
  optional?: string;
  initial?: string | null;
  required?: boolean;
  ltr?: boolean;
  /** Span both columns of a FieldGroup. */
  wide?: boolean;
};

export function Input({
  name,
  label,
  hint,
  optional,
  initial,
  required,
  ltr,
  wide,
  type = "text",
  autoComplete = "off",
  inputMode,
  maxLength,
}: Common & {
  type?: "text" | "date" | "email" | "tel" | "search" | "number";
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "search";
  maxLength?: number;
}) {
  const { error, value } = useField(name, initial);
  const id = useFieldId(name);
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} wide={wide}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        dir={ltr ? "ltr" : type === "text" ? "auto" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(inputClasses, ltr && "text-start rtl:text-end")}
      />
    </FieldFrame>
  );
}

export function TextArea({
  name,
  label,
  hint,
  optional,
  initial,
  required,
  rows = 3,
  maxLength,
  wide = true,
}: Common & { rows?: number; maxLength?: number }) {
  const { error, value } = useField(name, initial);
  const id = useFieldId(name);
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} wide={wide}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        dir="auto"
        defaultValue={value}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(inputClasses, "min-h-24")}
      />
    </FieldFrame>
  );
}

export function Select({
  name,
  label,
  hint,
  optional,
  initial,
  required,
  options,
  placeholder,
  wide,
}: Common & { options: { value: string; label: string }[]; placeholder?: string }) {
  const { error, value } = useField(name, initial);
  const id = useFieldId(name);
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} wide={wide}>
      <select
        id={id}
        name={name}
        defaultValue={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(inputClasses, "appearance-auto")}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export function Checkbox({
  name,
  label,
  hint,
  initial = false,
}: {
  name: string;
  label: string;
  hint?: string;
  initial?: boolean;
}) {
  // Checkboxes always span both columns of a FieldGroup.
  const { state, fieldMessages } = useContext(FormContext);
  const code = state.fieldErrors?.[name];
  const error = code ? (fieldMessages[code] ?? code) : undefined;
  const checked = state.values ? state.values[name] === "on" : initial;
  const id = useFieldId(name);
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <label htmlFor={id} className="flex min-h-11 items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="mt-1 size-5 shrink-0 accent-brand-800"
        />
        <span className="text-charcoal-900">{label}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="ms-8 text-sm text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ms-8 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Radio group (e.g. choosing a new status). */
export function RadioGroup({
  name,
  legend,
  options,
  initial,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; description?: string }[];
  initial?: string;
}) {
  const { state, fieldMessages } = useContext(FormContext);
  const code = state.fieldErrors?.[name];
  const error = code ? (fieldMessages[code] ?? code) : undefined;
  const current = state.values?.[name] ?? initial;
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-1 text-sm font-semibold text-charcoal-900">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-3 rounded-md border border-stone-200 bg-white p-3 has-checked:border-brand-700 has-checked:bg-brand-50"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={current === option.value}
            className="mt-1 size-5 shrink-0 accent-brand-800"
          />
          <span>
            <span className="block font-semibold text-charcoal-900">{option.label}</span>
            {option.description && (
              <span className="mt-0.5 block text-sm text-charcoal-700">{option.description}</span>
            )}
          </span>
        </label>
      ))}
      {error && <p className="text-sm font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}

/** Groups fields under a heading inside a form. */
export function FieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-stone-200 pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="text-base font-semibold text-brand-950">{title}</p>
        {description && <p className="mt-1 text-sm text-charcoal-700">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
