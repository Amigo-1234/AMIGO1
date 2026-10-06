import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/**
 * Credential hashing and keyed hashing. Pure Node (no Next.js) so it is unit-testable.
 *
 * Secrets (PINs, legacy passwords) are hashed with argon2id using OWASP's recommended
 * parameters, plus a server-side pepper (STUDENT_AUTH_SECRET) passed as argon2's `secret`.
 * A 6-digit PIN has only a million possibilities, so the pepper matters: a stolen
 * database alone is not enough to brute-force PINs offline.
 */
// `Algorithm` is a const enum in the typings (unusable with isolatedModules); 2 = Argon2id.
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashCredential(plain: string, pepper: string): Promise<string> {
  return hash(plain, { ...ARGON2_OPTIONS, secret: Buffer.from(pepper, "utf8") });
}

export async function verifyCredential(
  phcHash: string,
  plain: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await verify(phcHash, plain, { secret: Buffer.from(pepper, "utf8") });
  } catch {
    return false;
  }
}

const dummyHashes = new Map<string, Promise<string>>();

/**
 * Spend the same time as a real verification when there is nothing to verify (unknown ID,
 * no credential), so response timing does not reveal whether an account exists.
 */
export async function verifyAgainstDummy(plain: string, pepper: string): Promise<false> {
  if (!dummyHashes.has(pepper)) {
    dummyHashes.set(pepper, hashCredential(randomBytes(16).toString("hex"), pepper));
  }
  await verifyCredential(await dummyHashes.get(pepper)!, plain, pepper);
  return false;
}

/** HMAC-SHA256 with a purpose label, so one secret yields independent keys per use. */
export function keyedHash(secret: string, label: string, value: string): string {
  return createHmac("sha256", secret).update(`${label}\u0000${value}`).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 256 bits of randomness, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time string comparison (compares digests so lengths may differ). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
