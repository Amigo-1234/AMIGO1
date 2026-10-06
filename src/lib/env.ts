import "server-only";
import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Every variable is optional during Phase 1 so the app builds and runs without
 * credentials. Features that need a value call `requireEnv()`, which fails with a
 * clear message naming the missing variable instead of failing deep in a driver.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  DATABASE_URL: z.url().optional(),
  DATABASE_URL_UNPOOLED: z.url().optional(),
  STUDENT_SESSION_SECRET: z
    .string()
    .min(32, "STUDENT_SESSION_SECRET must be at least 32 characters")
    .optional(),
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
