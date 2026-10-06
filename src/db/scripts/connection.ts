import { Pool } from "pg";

/** Load .env.local / .env when present (scripts run outside Next.js). */
export function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // File absent: rely on the real environment.
    }
  }
}

/**
 * A single-connection pool for maintenance scripts. Prefers the direct (unpooled) Neon
 * URL, which migrations need. Prints only the host, never credentials.
 */
export function openScriptPool(): Pool {
  loadLocalEnv();
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). See .env.example.");
    process.exit(1);
  }
  console.log(`Database: ${new URL(url).host}`);
  return new Pool({ connectionString: url, max: 1 });
}
