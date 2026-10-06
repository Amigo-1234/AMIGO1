import { type NeonAuth, createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * The Neon Auth server instance (staff authentication), created lazily from environment
 * variables. Deliberately free of `server-only` so `src/proxy.ts` can use it too.
 *
 * Neon Auth keeps its session in `__Secure-neon-auth.*` cookies (HttpOnly, Secure,
 * SameSite=Lax) and caches verified session data in a cookie signed with
 * NEON_AUTH_COOKIE_SECRET, re-validating with Neon at least every 5 minutes.
 */
export const NEON_SESSION_COOKIE = "__Secure-neon-auth.session_token";

let instance: NeonAuth | null | undefined;

export function getNeonAuth(): NeonAuth | null {
  if (instance !== undefined) return instance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  instance =
    baseUrl && secret && secret.length >= 32
      ? createNeonAuth({
          baseUrl,
          cookies: { secret, sameSite: "lax", sessionDataTtl: 300 },
          logLevel: "warn",
        })
      : null;
  return instance;
}
