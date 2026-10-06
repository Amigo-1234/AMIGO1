import { and, eq, inArray, isNull } from "drizzle-orm";
import { DEFAULT_CURRICULUM, DEFAULT_LEVELS, DEFAULT_TERM_TYPES } from "@/domain/curriculum";
import { DEFAULT_GRADING_POLICY, validateGradingPolicy } from "@/domain/grading";
import { DEFAULT_ROLES, PERMISSIONS } from "@/domain/permissions";
import {
  gradeBands,
  gradingPolicies,
  levelSubjects,
  levels,
  permissions,
  rolePermissions,
  roles,
  subjects,
  systemSettings,
  termTypes,
} from "../schema";
import type { DbExecutor } from "../types";

export const DEFAULT_SETTINGS = [
  {
    key: "auth.legacy_v1_credentials_enabled",
    value: true,
    description:
      "Allow migrated families to sign in once with their hashed V1 password before setting a 6-digit PIN. Turn off to disable all legacy credentials.",
  },
] as const;

export type SeedSummary = Record<string, number>;

/**
 * Seed structural, non-sensitive defaults: term types, levels, subjects and curriculum
 * order, the default grading policy, the permission catalogue, system roles and default
 * settings. No people, credentials or financial data.
 *
 * Idempotent and conservative: it only inserts what is missing and never overwrites
 * changes administrators have made (renamed subjects, reordered curriculum, edited roles).
 * The one exception is that Super Admin always receives every catalogue permission.
 */
export async function seedDatabase(db: DbExecutor): Promise<SeedSummary> {
  const problems = validateGradingPolicy(DEFAULT_GRADING_POLICY);
  if (problems.length) throw new Error(`Default grading policy is invalid: ${problems.join("; ")}`);

  return db.transaction(async (tx) => {
    const summary: SeedSummary = {};
    const count = (key: string, rows: unknown[]) => (summary[key] = rows.length);

    count(
      "termTypes",
      await tx
        .insert(termTypes)
        .values([...DEFAULT_TERM_TYPES])
        .onConflictDoNothing()
        .returning(),
    );

    const insertedLevels = await tx
      .insert(levels)
      .values(
        DEFAULT_LEVELS.map((l) => ({
          code: l.code,
          nameEn: l.nameEn,
          nameAr: l.nameAr,
          stageEn: l.stageEn,
          stageAr: l.stageAr,
          sortOrder: l.sortOrder,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: levels.id, code: levels.code });
    count("levels", insertedLevels);

    const allLevels = await tx.select({ id: levels.id, code: levels.code }).from(levels);
    const levelIdByCode = new Map(allLevels.map((l) => [l.code, l.id]));
    // Promotion links are set only on levels created by this run.
    for (const { code } of insertedLevels) {
      const next = DEFAULT_LEVELS.find((l) => l.code === code)?.nextLevelCode;
      const nextId = next ? levelIdByCode.get(next) : undefined;
      if (nextId) {
        await tx
          .update(levels)
          .set({ nextLevelId: nextId })
          .where(and(eq(levels.code, code), isNull(levels.nextLevelId)));
      }
    }

    const allSubjects = Object.values(DEFAULT_CURRICULUM).flat();
    count(
      "subjects",
      await tx.insert(subjects).values(allSubjects).onConflictDoNothing().returning(),
    );
    const subjectRows = await tx
      .select({ id: subjects.id, code: subjects.code })
      .from(subjects)
      .where(
        inArray(
          subjects.code,
          allSubjects.map((s) => s.code),
        ),
      );
    const subjectIdByCode = new Map(subjectRows.map((s) => [s.code, s.id]));

    const curriculumRows = Object.entries(DEFAULT_CURRICULUM).flatMap(([levelCode, list]) => {
      const levelId = levelIdByCode.get(levelCode);
      if (!levelId) return [];
      return list.map((s, index) => ({
        levelId,
        subjectId: subjectIdByCode.get(s.code)!,
        displayOrder: index + 1,
      }));
    });
    count(
      "levelSubjects",
      await tx.insert(levelSubjects).values(curriculumRows).onConflictDoNothing().returning(),
    );

    const [existingPolicy] = await tx
      .select({ id: gradingPolicies.id })
      .from(gradingPolicies)
      .where(eq(gradingPolicies.name, DEFAULT_GRADING_POLICY.name));
    if (existingPolicy) {
      summary.gradingPolicies = 0;
    } else {
      const [anyDefault] = await tx
        .select({ id: gradingPolicies.id })
        .from(gradingPolicies)
        .where(eq(gradingPolicies.isDefault, true));
      const [policy] = await tx
        .insert(gradingPolicies)
        .values({
          name: DEFAULT_GRADING_POLICY.name,
          caMax: DEFAULT_GRADING_POLICY.caMax,
          examMax: DEFAULT_GRADING_POLICY.examMax,
          isDefault: !anyDefault,
        })
        .returning({ id: gradingPolicies.id });
      await tx
        .insert(gradeBands)
        .values(DEFAULT_GRADING_POLICY.bands.map((band) => ({ ...band, policyId: policy.id })));
      summary.gradingPolicies = 1;
    }

    count(
      "permissions",
      await tx
        .insert(permissions)
        .values(Object.entries(PERMISSIONS).map(([key, value]) => ({ key, ...value })))
        .onConflictDoNothing()
        .returning(),
    );

    const insertedRoles = await tx
      .insert(roles)
      .values(
        DEFAULT_ROLES.map((r) => ({
          key: r.key,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          description: r.description,
          isSystem: true,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: roles.id, key: roles.key });
    count("roles", insertedRoles);

    const [superAdmin] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, "super_admin"));
    const grants = [
      ...insertedRoles.flatMap(({ id, key }) =>
        (DEFAULT_ROLES.find((r) => r.key === key)?.permissions ?? []).map((permissionKey) => ({
          roleId: id,
          permissionKey,
        })),
      ),
      ...Object.keys(PERMISSIONS).map((permissionKey) => ({
        roleId: superAdmin.id,
        permissionKey,
      })),
    ];
    count(
      "rolePermissions",
      await tx.insert(rolePermissions).values(grants).onConflictDoNothing().returning(),
    );

    count(
      "systemSettings",
      await tx
        .insert(systemSettings)
        .values(DEFAULT_SETTINGS.map((s) => ({ ...s })))
        .onConflictDoNothing()
        .returning(),
    );

    return summary;
  });
}
