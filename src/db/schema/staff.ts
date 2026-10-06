import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { permissionEffect, staffStatus } from "./enums";

/**
 * Staff members who can sign in to the admin system. Passwords are held by Neon Auth,
 * never here; `auth_user_id` links to the Neon Auth user (set in Phase 3).
 */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid().primaryKey().defaultRandom(),
    authUserId: text().unique(),
    email: text().notNull(),
    fullName: text().notNull(),
    status: staffStatus().notNull().default("invited"),
    lastSignInAt: timestamptz(),
    createdById: uuid().references((): AnyPgColumn => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    uniqueIndex("staff_users_email_unique").on(sql`lower(email)`),
    check("staff_users_email_format", sql`email ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
  ],
);

/** Named bundles of permissions. System roles are seeded and cannot be renamed by key. */
export const roles = pgTable(
  "roles",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull().unique(),
    nameEn: text().notNull(),
    nameAr: text().notNull(),
    description: text(),
    isSystem: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("roles_key_format", sql`key ~ '^[a-z_]+$'`)],
);

/** The permission catalogue (keys mirror src/domain/permissions.ts). */
export const permissions = pgTable(
  "permissions",
  {
    key: text().primaryKey(),
    category: text().notNull(),
    description: text().notNull(),
    createdAt: createdAt(),
  },
  () => [check("permissions_key_format", sql`key ~ '^[a-z_]+\\.[a-z_]+$'`)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionKey] }),
    index("role_permissions_permission_idx").on(t.permissionKey),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    grantedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

/** Individual exceptions to a staff member's role permissions. A denial always wins. */
export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    userId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
    effect: permissionEffect().notNull(),
    reason: text(),
    grantedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permissionKey] })],
);
