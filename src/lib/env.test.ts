import { describe, expect, it } from "vitest";
import { parseServerEnv, requireEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts an empty environment", () => {
    expect(parseServerEnv({}).NODE_ENV).toBe("development");
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ DATABASE_URL: "", STUDENT_AUTH_SECRET: "" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.STUDENT_AUTH_SECRET).toBeUndefined();
  });

  it("rejects malformed values with the variable name", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "not a url" })).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({ STUDENT_AUTH_SECRET: "short" })).toThrow(/STUDENT_AUTH_SECRET/);
  });
});

describe("requireEnv", () => {
  it("returns a present value", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgres://user@host/db" });
    expect(requireEnv("DATABASE_URL", env)).toBe("postgres://user@host/db");
  });

  it("names the missing variable", () => {
    expect(() => requireEnv("DATABASE_URL", parseServerEnv({}))).toThrow(
      "Missing required environment variable DATABASE_URL",
    );
  });
});
