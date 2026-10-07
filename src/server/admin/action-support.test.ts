import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../staff-auth/access";
import { StaffAuthenticationError } from "../staff-auth/state";
import { AdminRuleError } from "./common";

// Unit test of the wrapper only: its collaborators are replaced inside this test process.
const authorize = vi.fn();
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("../staff-auth/current", () => ({ authorizeStaffAction: (p: string) => authorize(p) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

const { runAdminAction } = await import("./action-support");

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const staff = { staffId: "s1", permissions: new Set(["students.create"]) };

beforeEach(() => {
  authorize.mockReset();
  redirect.mockClear();
});

describe("runAdminAction", () => {
  it("checks the specific permission on the server and never runs the work without it", async () => {
    authorize.mockRejectedValue(new AuthorizationError("students.create"));
    const work = vi.fn();
    const result = await runAdminAction(
      form({ locale: "ar", fullName: "Ali" }),
      "students.create",
      work,
    );
    expect(authorize).toHaveBeenCalledWith("students.create");
    expect(work).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "forbidden", values: { locale: "ar", fullName: "Ali" } });
  });

  it("sends signed-out callers to the localized sign-in page", async () => {
    authorize.mockRejectedValue(new StaffAuthenticationError("signed_out"));
    const work = vi.fn();
    await expect(runAdminAction(form({ locale: "ar" }), "students.read", work)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/ar/staff/login?reason=expired");
    expect(work).not.toHaveBeenCalled();
  });

  it("returns business-rule refusals as codes and hides unexpected errors", async () => {
    authorize.mockResolvedValue(staff);
    const refused = await runAdminAction(form({ locale: "en" }), "students.create", async () => {
      throw new AdminRuleError("session_closed");
    });
    expect(refused.error).toBe("session_closed");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await runAdminAction(form({ locale: "en" }), "students.create", async () => {
      throw new Error("connection to postgres://user:secret@host failed");
    });
    expect(failed.error).toBe("server");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    spy.mockRestore();
  });

  it("redirects to the localized destination on success, with the verified staff member", async () => {
    authorize.mockResolvedValue(staff);
    const work = vi.fn(async ({ actor }: { actor: unknown }) => {
      expect(actor).toBe(staff);
      return "/admin/students/abc?done=created";
    });
    await expect(runAdminAction(form({ locale: "en" }), "students.create", work)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/en/admin/students/abc?done=created");
  });

  it("falls back to English for an unknown locale and ignores framework fields", async () => {
    authorize.mockRejectedValue(new AuthorizationError());
    const result = await runAdminAction(
      form({ locale: "fr", $ACTION_ID_1: "x", q: "a" }),
      "students.read",
      vi.fn(),
    );
    expect(result.values).toEqual({ locale: "fr", q: "a" });
  });
});
