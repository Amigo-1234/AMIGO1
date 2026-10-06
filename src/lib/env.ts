import "server-only";
import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Every variable is optional so the app builds without credentials. Features that need a
 * value call `requireEnv()`, which fails with a clear message naming the missing variable
 * instead of failing deep in a driver. Values are never logged.
 */
const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters`).optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  DATABASE_URL: z.url().optional(),
  DATABASE_URL_UNPOOLED: z.url().optional(),
  /** Neon Auth URL for staff sign-in (Neon console → Auth → Configuration). */
  NEON_AUTH_BASE_URL: z.url().optional(),
  /** Signs Neon Auth's cached session-data cookie. */
  NEON_AUTH_COOKIE_SECRET: secret("NEON_AUTH_COOKIE_SECRET"),
  /** Server-side pepper for student PIN hashes and the key for hashing throttle identifiers. */
  STUDENT_AUTH_SECRET: secret("STUDENT_AUTH_SECRET"),
  /** One-time code that unlocks first Super Admin setup. Remove once setup is complete. */
  STAFF_BOOTSTRAP_TOKEN: secret("STAFF_BOOTSTRAP_TOKEN"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Treat empty strings (as left by copying .env.example) as unset. */
function withoutEmptyValues(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

type OptionalKey = {
  [K in keyof ServerEnv]-?: undefined extends ServerEnv[K] ? K : never;
}[keyof ServerEnv];

export function requireEnv<K extends OptionalKey>(
  key: K,
  env: ServerEnv = getServerEnv(),
): NonNullable<ServerEnv[K]> {
  const value = env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${key}. See .env.example.`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
