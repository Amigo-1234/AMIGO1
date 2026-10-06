import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../schema";
import { seedDatabase } from "../seed";
import { openScriptConnection } from "./connection";

// Inserts missing structural defaults (safe to run repeatedly). Run after db:migrate.
async function main() {
  const { pool, close } = await openScriptConnection();
  try {
    const summary = await seedDatabase(drizzle(pool, { schema, casing: "snake_case" }));
    console.log("Seed complete. Rows inserted:", summary);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
