import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const inputClasses =
  "block min-h-11 w-full rounded-md border border-stone-500/70 bg-white px-3 py-2 text-base " +
  "text-charcoal-900 shadow-sm transition-colors " +
  "hover:border-stone-500 focus-visible:border-brand-700 focus-visible:outline-2 " +
  "focus-visible:outline-offset-0 focus-visible:outline-brand-700/25 " +
  "disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-600 " +
  "aria-invalid:border-danger-700";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Labelled text input with optional hint and error, wired with `aria-describedby`.
 * Text sizes stay at 16px on inputs so iOS does not zoom on focus.
 */
export function TextField({ id, label, hint, error, className, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-charcoal-900">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={inputClasses}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-sm text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
