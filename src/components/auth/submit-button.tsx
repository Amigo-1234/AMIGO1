"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that shows a pending label and blocks double submission. */
export function SubmitButton({
  label,
  pendingLabel,
  variant,
  size = "lg",
  block = true,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size={size}
      block={block}
      variant={variant}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
