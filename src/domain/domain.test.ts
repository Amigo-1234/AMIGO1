import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRICULUM,
  DEFAULT_LEVELS,
  DEFAULT_TERM_TYPES,
  sessionLabelForStartYear,
} from "./curriculum";
import { DEFAULT_GRADING_POLICY, validateGradingPolicy } from "./grading";
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS, resolvePermissions } from "./permissions";
import {
  STUDENT_ID_PATTERN,
  STUDENT_ID_SQL_PATTERN,
  formatStudentId,
  normalizeStudentIdInput,
  parseStudentId,
} from "./student-id";

describe("student IDs", () => {
  it("formats the V1 format with zero padding", () => {
    expect(formatStudentId({ levelCode: "IBT", year: 2025, serial: 1 })).toBe("MGIBT-2025-001");
    expect(formatStudentId({ levelCode: "IDA", year: 2025, serial: 14 })).toBe("MGIDA-2025-014");
    expect(formatStudentId({ levelCode: "THA", year: 2026, serial: 1234 })).toBe("MGTHA-2026-1234");
  });

  it("parses valid IDs and rejects others", () => {
    expect(parseStudentId("MGTHA-2025-007")).toEqual({ levelCode: "THA", year: 2025, serial: 7 });
    expect(parseStudentId("MGIBT-2025-000")).toBeNull();
    expect(parseStudentId("mgibt-2025-001")).toBeNull();
    expect(parseStudentId("MGIBT-25-001")).toBeNull();
    expect(parseStudentId("MGIBT-2025-01")).toBeNull();
  });

  it("round-trips", () => {
    const parts = { levelCode: "IDA", year: 2030, serial: 42 };
    expect(parseStudentId(formatStudentId(parts))).toEqual(parts);
  });

  it("rejects invalid parts", () => {
    expect(() => formatStudentId({ levelCode: "ib", year: 2025, serial: 1 })).toThrow();
    expect(() => formatStudentId({ levelCode: "IBT", year: 2025, serial: 0 })).toThrow();
  });

  it("normalises typed input", () => {
    expect(normalizeStudentIdInput("  mgibt 2025 001 ")).toBe("MGIBT-2025-001");
    expect(normalizeStudentIdInput("MGIBT_2025—001")).toBe("MGIBT-2025-001");
  });

  it("keeps the JS and SQL patterns equivalent", () => {
    const sql = new RegExp(STUDENT_ID_SQL_PATTERN);
    for (const id of ["MGIBT-2025-001", "MGAB-1999-1000", "MGIBT-2025-01", "XMGIBT-2025-001"]) {
      expect(sql.test(id), id).toBe(STUDENT_ID_PATTERN.test(id));
    }
  });
});

describe("grading policy", () => {
  it("default policy reproduces V1 and is valid", () => {
    expect(DEFAULT_GRADING_POLICY.caMax).toBe(40);
    expect(DEFAULT_GRADING_POLICY.examMax).toBe(60);
    expect(validateGradingPolicy(DEFAULT_GRADING_POLICY)).toEqual([]);
  });

  it("detects gaps, overlaps and wrong totals", () => {
    const base = DEFAULT_GRADING_POLICY;
    expect(validateGradingPolicy({ ...base, caMax: 50 })).toContain(
      "CA and exam maximums must add up to 100",
    );
    const gap = base.bands.map((b) => (b.grade === "E" ? { ...b, minScore: 41 } : b));
    expect(validateGradingPolicy({ ...base, bands: gap })).toContain("Scores 40–40 have no grade");
    const overlap = base.bands.map((b) => (b.grade === "B" ? { ...b, maxScore: 72 } : b));
    expect(validateGradingPolicy({ ...base, bands: overlap })).toContain(
      "Band A overlaps another band",
    );
    const short = base.bands.filter((b) => b.grade !== "A");
    expect(validateGradingPolicy({ ...base, bands: short })).toContain(
      "Scores 70–100 have no grade",
    );
  });
});

describe("curriculum seed data", () => {
  it("has the three V1 levels in order, ending in graduation", () => {
    expect(DEFAULT_LEVELS.map((l) => l.code)).toEqual(["IBT", "IDA", "THA"]);
    expect(DEFAULT_LEVELS.map((l) => l.nextLevelCode)).toEqual(["IDA", "THA", null]);
  });

  it("has ten uniquely coded subjects per level", () => {
    const codes = Object.values(DEFAULT_CURRICULUM).flatMap((subjects) =>
      subjects.map((s) => s.code),
    );
    expect(new Set(codes).size).toBe(30);
    for (const level of DEFAULT_LEVELS) {
      expect(DEFAULT_CURRICULUM[level.code]).toHaveLength(10);
    }
    expect(DEFAULT_CURRICULUM.IBT[0].nameEn).toBe("Tajweed");
    expect(DEFAULT_CURRICULUM.THA[0].nameEn).toBe("Tafsir III");
  });

  it("has First, Second and Third terms plus a legacy term", () => {
    expect(DEFAULT_TERM_TYPES.filter((t) => !t.isLegacy).map((t) => t.code)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(DEFAULT_TERM_TYPES.filter((t) => t.isLegacy)).toHaveLength(1);
  });

  it("maps V1 years to sessions", () => {
    expect(sessionLabelForStartYear(2025)).toBe("2025/2026");
  });
});

describe("permissions", () => {
  it("uses well-formed keys", () => {
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("default roles reference only known permissions", () => {
    for (const role of DEFAULT_ROLES) {
      for (const permission of role.permissions) expect(PERMISSIONS).toHaveProperty([permission]);
    }
    expect(DEFAULT_ROLES.find((r) => r.key === "super_admin")?.permissions).toEqual(
      ALL_PERMISSIONS,
    );
  });

  it("separates duties between roles", () => {
    const has = (key: string, permission: string) =>
      DEFAULT_ROLES.find((r) => r.key === key)!.permissions.includes(permission as never);
    expect(has("finance_admin", "results.enter")).toBe(false);
    expect(has("academic_admin", "payments.record")).toBe(false);
    expect(has("registrar", "results.publish")).toBe(false);
  });

  it("resolves grants and lets denials win", () => {
    const effective = resolvePermissions({
      rolePermissions: ["students.read", "payments.record"],
      grants: ["reports.read"],
      denials: ["payments.record"],
    });
    expect([...effective].sort()).toEqual(["reports.read", "students.read"]);
  });
});
