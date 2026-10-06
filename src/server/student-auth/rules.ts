/**
 * Input rules for student / parent sign-in. Shared by the browser (for instant feedback)
 * and the server (which is the authority), so this file has no server-only imports.
 */

/** A V2 PIN: exactly six digits, nothing else. */
export const PIN_PATTERN = /^[0-9]{6}$/;

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

/**
 * V1 passwords were up to three characters (usually three letters) and compared
 * case-insensitively, so they are normalised to lowercase before hashing and checking.
 */
export const LEGACY_PASSWORD_PATTERN = /^\S{1,3}$/;

export function normalizeLegacyPassword(value: string): string {
  return value.trim().toLowerCase();
}

export type SecretKind = "pin" | "legacy_v1_password";

/**
 * What kind of secret was typed: a 6-digit PIN, or (only while legacy sign-in is enabled)
 * a short V1 password. Anything else is invalid input.
 */
export function classifySecret(raw: string, legacyEnabled: boolean): SecretKind | null {
  if (isValidPin(raw)) return "pin";
  if (legacyEnabled && LEGACY_PASSWORD_PATTERN.test(raw.trim())) return "legacy_v1_password";
  return null;
}

/** Student statuses that may sign in. Graduates keep read access to their history. */
export const SIGN_IN_STATUSES = ["active", "graduated"] as const;

export function canSignIn(status: string): boolean {
  return (SIGN_IN_STATUSES as readonly string[]).includes(status);
}

/** Session lifetimes. A legacy sign-in only grants a short session to set a new PIN. */
export const STUDENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const PIN_SETUP_SESSION_TTL_MS = 15 * 60 * 1000;
/** How often an active session's last-seen time is refreshed. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
