/** Join class names, skipping falsy values. Callers avoid conflicting utilities instead of relying on merging. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
