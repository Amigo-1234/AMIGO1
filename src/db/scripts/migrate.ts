import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openScriptConnection, reportScriptError } from "./connection";

// Applies pending migrations from ./drizzle in order (all-or-nothing per run).
async function main() {
  const { pool, close } = await openScriptConnection();
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("Migrations applied.");
  } finally {
    await close();
  }
}

main().catch((error) => reportScriptError("Migration failed", error));
