import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (
  path: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
) =>
  new NextRequest(new URL(path, "https://markaz.example"), {
    headers: {
      ...headers,
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    },
  });

const location = (response: Response) => {
  const value = response.headers.get("location");
  return value ? new URL(value).pathname + new URL(value).search : null;
};

describe("proxy", () => {
  it("adds a locale prefix", async () => {
    expect(location(await proxy(request("/portal", {}, { "accept-language": "ar" })))).toBe(
      "/ar/portal",
    );
  });

  it("sends visitors without a student session from portal pages to the localized sign-in", async () => {
    expect(location(await proxy(request("/ar/portal")))).toBe("/ar/portal/login");
    expect(location(await proxy(request("/en/portal/set-pin")))).toBe("/en/portal/login");
  });

  it("lets the sign-in page and requests with a session cookie through (the page then verifies)", async () => {
    expect(location(await proxy(request("/en/portal/login")))).toBeNull();
    expect(
      location(await proxy(request("/en/portal", { "__Host-mig_student": "token" }))),
    ).toBeNull();
  });

  it("leaves staff pages to the server-side check when Neon Auth is not configured", async () => {
    expect(location(await proxy(request("/en/admin")))).toBeNull();
  });

  it("does not treat look-alike paths as protected", async () => {
    expect(location(await proxy(request("/en/portalx")))).toBeNull();
    expect(location(await proxy(request("/en/administration")))).toBeNull();
  });
});
