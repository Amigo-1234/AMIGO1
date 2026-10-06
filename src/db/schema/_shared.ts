import { timestamp } from "drizzle-orm/pg-core";

// Column helpers. Each call returns a fresh builder (builders must not be shared between tables).
// Timestamps are always timestamptz; `updated_at` is maintained by a database trigger.
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const timestamptz = () => timestamp({ withTimezone: true });
