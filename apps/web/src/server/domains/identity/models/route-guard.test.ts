import { describe, expect, it } from "vitest";
import { bodyTooLarge, isPublicPath, safeNextPath, signInUrl } from "./route-guard";

describe("safeNextPath", () => {
  it("keeps paths on this site, with their query and hash", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/items?tab=mine#top")).toBe("/items?tab=mine#top");
    expect(safeNextPath("/a/../b")).toBe("/b");
  });

  it("sends anything that could leave the site to /", () => {
    for (const value of [
      "//evil.test",
      "https://evil.test",
      "http:/evil.test",
      "/\\evil.test",
      "\\\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "javascript:alert(1)",
      "evil.test",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(value), String(value)).toBe("/");
    }
  });

  it("never points back at sign-in", () => {
    expect(safeNextPath("/sign-in")).toBe("/");
    expect(safeNextPath("/sign-in?next=/x")).toBe("/");
  });
});

describe("isPublicPath and signInUrl", () => {
  it("treats only sign-in as public", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/sign-inx")).toBe(false);
    expect(isPublicPath("/account/password")).toBe(false);
  });

  it("builds the sign-in URL with an encoded next, and none for the home page", () => {
    expect(signInUrl("/items?tab=mine")).toBe("/sign-in?next=%2Fitems%3Ftab%3Dmine");
    expect(signInUrl("/")).toBe("/sign-in");
    expect(signInUrl("//evil.test")).toBe("/sign-in");
  });
});

describe("bodyTooLarge", () => {
  const MB = 1024 * 1024;
  const post = (pathname: string, contentLength: number | null, hasSession = true) =>
    bodyTooLarge({ method: "POST", pathname, contentLength, hasSession });

  it("lets the draft editor send up to 28 MB, with a session", () => {
    expect(post("/submissions/01J0000000000000000000000A", 27 * MB)).toBe(false);
    expect(post("/submissions/01J0000000000000000000000A", 29 * MB)).toBe(true);
  });

  it("keeps 1 MB everywhere else, and without a session", () => {
    expect(post("/sign-in", 2 * MB, false)).toBe(true);
    expect(post("/submissions/01J0000000000000000000000A", 2 * MB, false)).toBe(true);
    expect(post("/admin/scopes", 2 * MB)).toBe(true);
    expect(post("/admin/scopes", MB)).toBe(false);
  });

  it("leaves GETs and bodies without a length to Next.js's own limit", () => {
    expect(
      bodyTooLarge({ method: "GET", pathname: "/", contentLength: 50 * MB, hasSession: false }),
    ).toBe(false);
    expect(post("/sign-in", null, false)).toBe(false);
  });
});
