import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { updatedAt } from "./_shared";
import { staffUsers } from "./staff";

/** School-wide settings as typed JSON values (validated by the application). */
export const systemSettings = pgTable(
  "system_settings",
  {
    key: text().primaryKey(),
    value: jsonb().notNull(),
    description: text(),
    updatedAt: updatedAt(),
    updatedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
  },
  () => [check("system_settings_key_format", sql`key ~ '^[a-z0-9_]+(\\.[a-z0-9_]+)*$'`)],
);
