import { describe, expect, it } from "vitest";
import { bodyTooLarge, isPublicPath, safeBackPath, safeNextPath, signInUrl } from "./route-guard";

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
      // Dot-segments that resolve to "//evil.test" (found by 120's witness).
      "/a/..//evil.test",
      "/%2e%2e//evil.test",
      "/a/../\t/evil.test",
      "/a/..//x//evil.test",
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
  it("treats only sign-in and setup as public", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/setup")).toBe(true);
    expect(isPublicPath("/setup/")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/sign-inx")).toBe(false);
    expect(isPublicPath("/setupx")).toBe(false);
    expect(isPublicPath("/account/password")).toBe(false);
  });

  it("never sends anyone back to setup after sign-in", () => {
    expect(safeNextPath("/setup")).toBe("/");
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
    expect(post("/workspaces/global", 2 * MB)).toBe(true);
    expect(post("/workspaces/global", MB)).toBe(false);
  });

  it("leaves GETs and bodies without a length to Next.js's own limit", () => {
    expect(
      bodyTooLarge({ method: "GET", pathname: "/", contentLength: 50 * MB, hasSession: false }),
    ).toBe(false);
    expect(post("/sign-in", null, false)).toBe(false);
  });
});

describe("the language route (129)", () => {
  it("is a public path, and never somewhere sign-in comes back to", () => {
    expect(isPublicPath("/language")).toBe(true);
    expect(isPublicPath("/language/anything")).toBe(true);
    expect(isPublicPath("/languages")).toBe(false);
    expect(safeNextPath("/language?set=pt")).toBe("/");
  });

  it("safeBackPath keeps any path on this site, public pages included", () => {
    expect(safeBackPath("/sign-in?next=%2Fitems&email=a%40b.test")).toBe(
      "/sign-in?next=%2Fitems&email=a%40b.test",
    );
    expect(safeBackPath("/setup")).toBe("/setup");
    expect(safeBackPath("/account/language#top")).toBe("/account/language#top");
    expect(safeBackPath("/")).toBe("/");
  });

  it("safeBackPath never loops through the language route, or leaves the site", () => {
    for (const value of [
      "/language?set=pt&next=%2Fsign-in",
      "/language",
      "//evil.test",
      "https://evil.test",
      "/\\evil.test",
      "/a/..//evil.test",
      "/%2e%2e//evil.test",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ])
      expect(safeBackPath(value as string)).toBe("/");
  });
});
