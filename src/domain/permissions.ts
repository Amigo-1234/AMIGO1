/**
 * Permission catalogue and default roles.
 *
 * Authorisation checks permissions (e.g. "payments.record"), never role names. Roles are
 * named bundles of permissions stored in the database; a staff member may hold several
 * roles, plus individual grants or denials. Keys are stable identifiers: never rename one,
 * add a new key instead.
 */
export const PERMISSIONS = {
  "students.read": { category: "students", description: "View student records" },
  "students.create": { category: "students", description: "Register students" },
  "students.update": { category: "students", description: "Edit student details" },
  "students.archive": { category: "students", description: "Archive or withdraw students" },
  "student_credentials.reset": { category: "students", description: "Issue or reset student PINs" },
  "enrollments.manage": {
    category: "students",
    description: "Enrol students in sessions and levels",
  },
  "promotions.run": { category: "students", description: "Promote, repeat and graduate students" },
  "sessions.manage": {
    category: "academics",
    description: "Create, activate and close sessions and terms",
  },
  "curriculum.manage": {
    category: "academics",
    description: "Manage levels, subjects and their order",
  },
  "grading.manage": { category: "academics", description: "Manage grading policies" },
  "results.read": { category: "results", description: "View scores and results" },
  "results.enter": { category: "results", description: "Enter and correct scores" },
  "results.publish": { category: "results", description: "Publish and unpublish results" },
  "fees.read": { category: "finance", description: "View fees, balances and statements" },
  "fees.manage": { category: "finance", description: "Manage fee structures and charges" },
  "payments.record": { category: "finance", description: "Record payments and issue receipts" },
  "payments.void": { category: "finance", description: "Void payments" },
  "reports.read": { category: "operations", description: "View reports" },
  "audit.read": { category: "operations", description: "View the audit log" },
  "staff.read": { category: "operations", description: "View staff accounts" },
  "staff.manage": { category: "operations", description: "Invite and suspend staff, assign roles" },
  "settings.manage": { category: "operations", description: "Change system settings" },
  "migration.run": { category: "operations", description: "Run legacy data migration" },
} as const satisfies Record<string, { category: string; description: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type RoleDefinition = {
  key: string;
  nameEn: string;
  nameAr: string;
  description: string;
  permissions: readonly Permission[];
};

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    key: "super_admin",
    nameEn: "Super Admin",
    nameAr: "المشرف العام",
    description: "Full system access.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "registrar",
    nameEn: "Registrar",
    nameAr: "المسجّل",
    description: "Student registration, enrolment and promotion.",
    permissions: [
      "students.read",
      "students.create",
      "students.update",
      "students.archive",
      "student_credentials.reset",
      "enrollments.manage",
      "promotions.run",
      "reports.read",
    ],
  },
  {
    key: "academic_admin",
    nameEn: "Academic Admin",
    nameAr: "المشرف الأكاديمي",
    description: "Subjects, scores, results and publication.",
    permissions: [
      "students.read",
      "curriculum.manage",
      "grading.manage",
      "results.read",
      "results.enter",
      "results.publish",
      "reports.read",
    ],
  },
  {
    key: "finance_admin",
    nameEn: "Finance Admin",
    nameAr: "المشرف المالي",
    description: "Fees, payments, receipts and statements.",
    permissions: [
      "students.read",
      "fees.read",
      "fees.manage",
      "payments.record",
      "payments.void",
      "reports.read",
    ],
  },
];

/**
 * Effective permissions: everything granted by any held role, plus individual grants,
 * minus individual denials (a denial always wins).
 */
export function resolvePermissions({
  rolePermissions,
  grants = [],
  denials = [],
}: {
  rolePermissions: Iterable<string>;
  grants?: Iterable<string>;
  denials?: Iterable<string>;
}): Set<string> {
  const effective = new Set([...rolePermissions, ...grants]);
  for (const denied of denials) effective.delete(denied);
  return effective;
}
