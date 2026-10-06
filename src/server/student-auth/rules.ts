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
 * Weak-PIN rule for **new** PINs (existing PINs keep working at sign-in). Deliberately small
 * and explainable rather than a long blocklist. A PIN is too predictable when it:
 *
 * 1. repeats one digit: 000000, 777777
 * 2. steps steadily up or down (wrapping 9↔0): 123456, 654321, 890123, 098765
 * 3. repeats a short block: 121212, 909090, 123123, 456456
 * 4. reads the same backwards: 123321, 145541, 900009
 * 5. doubles each digit of a steady run: 112233, 998877, 001122
 */
export function isWeakPin(pin: string): boolean {
  if (!isValidPin(pin)) return false;
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((digit, i) => (digit - d[i] + 10) % 10);
  const repeatsBlock = (size: number) => d.every((digit, i) => digit === d[i % size]);

  if (repeatsBlock(1)) return true; // 1
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return true; // 2
  if (repeatsBlock(2) || repeatsBlock(3)) return true; // 3
  if (pin === [...pin].reverse().join("")) return true; // 4
  const pairs = d[0] === d[1] && d[2] === d[3] && d[4] === d[5];
  const pairStep1 = (d[2] - d[0] + 10) % 10;
  const pairStep2 = (d[4] - d[2] + 10) % 10;
  if (pairs && pairStep1 === pairStep2 && (pairStep1 === 1 || pairStep1 === 9)) return true; // 5
  return false;
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
