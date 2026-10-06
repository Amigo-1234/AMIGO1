import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** A quiet surface: white on ivory, hairline border, minimal shadow. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-stone-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}
