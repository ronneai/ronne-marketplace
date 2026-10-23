import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

const hold = vi.hoisted(() => ({ requirement: null as null | "reviewers" | "everyone" }));
const password = vi.hoisted(() => ({ held: false }));
vi.mock("@/server/http/password-change-hold", () => ({
  PASSWORD_PATH: "/account/password",
  passwordChangeHold: vi.fn(async () => password.held),
}));
vi.mock("@/server/http/two-factor-hold", () => ({
  SECURITY_PATH: "/account/security",
  twoFactorHold: vi.fn(async () => hold.requirement),
}));
const path = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/server/http/request-headers", () => ({
  requestHeaders: async () => new Headers(path.value ? { "x-ronne-path": path.value } : undefined),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { holdPage } = await import("./hold");

const root = new URL(".", import.meta.url).pathname;
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });

describe("the two-factor hold on pages (105)", () => {
  it("sends a held person to /account/security, and nobody else", async () => {
    hold.requirement = "reviewers";
    await expect(holdPage()).rejects.toThrow("REDIRECT /account/security");
    hold.requirement = null;
    await expect(holdPage()).resolves.toBeUndefined();
  });

  it("brings a held person back to /device and its code once two-factor is on (107)", async () => {
    hold.requirement = "everyone";
    path.value = "/device?user_code=WDJB-MJHT";
    await expect(holdPage()).rejects.toThrow(
      "REDIRECT /account/security?next=%2Fdevice%3Fuser_code%3DWDJB-MJHT",
    );
    path.value = "/catalogue";
    await expect(holdPage()).rejects.toThrow(/^REDIRECT \/account\/security$/);
    path.value = null;
    hold.requirement = null;
  });

  it("sends someone who must change their password to the change page, with where they were going (128)", async () => {
    password.held = true;
    path.value = "/catalogue?q=a";
    await expect(holdPage()).rejects.toThrow(
      "REDIRECT /account/password?next=%2Fcatalogue%3Fq%3Da",
    );
    path.value = "/device?user_code=WDJB-MJHT";
    await expect(holdPage()).rejects.toThrow(
      "REDIRECT /account/password?next=%2Fdevice%3Fuser_code%3DWDJB-MJHT",
    );
    // No page asked for: nothing to come back to.
    path.value = null;
    await expect(holdPage()).rejects.toThrow(/^REDIRECT \/account\/password$/);
    // The change page itself, and nothing else, is open.
    path.value = "/account/password?next=%2Fitems";
    await expect(holdPage()).resolves.toBeUndefined();
    password.held = false;
    path.value = null;
  });

  it("asks for the password before two-factor, on the change page too (128)", async () => {
    password.held = true;
    hold.requirement = "everyone";
    path.value = "/items";
    await expect(holdPage()).rejects.toThrow("REDIRECT /account/password?next=%2Fitems");
    path.value = "/account/password";
    await expect(holdPage()).resolves.toBeUndefined();
    // Once the password is changed, two-factor is next.
    password.held = false;
    await expect(holdPage()).rejects.toThrow("REDIRECT /account/security");
    hold.requirement = null;
    path.value = null;
  });

  it("keeps the security page, which doesn't call holdPage, behind the password hold too (128)", () => {
    const source = readFileSync(join(root, "account", "security", "page.tsx"), "utf8");
    const password = source.indexOf("passwordChangeHold(request)");
    const twoFactor = source.indexOf("twoFactorStatus(request)");
    expect(password).toBeGreaterThan(-1);
    expect(password).toBeLessThan(twoFactor);
  });

  it("is the first thing every page in the app frame does, but /account/security", () => {
    const missing = pages(root)
      .map((path) => relative(root, path))
      .filter((path) => path !== join("account", "security", "page.tsx"))
      .filter((path) => {
        const source = readFileSync(join(root, path), "utf8");
        const body = /export default (\w+);/.exec(source)?.[1];
        // The component's first statement, before any read.
        const start = body ? source.indexOf(`const ${body} = async`) : -1;
        const open = start >= 0 ? source.indexOf("=> {", start) : -1;
        const first = open >= 0 ? source.slice(open + 4).trimStart() : "";
        return !first.startsWith("await holdPage();");
      });
    expect(missing).toEqual([]);
    expect(pages(root).length).toBeGreaterThan(20);
  });
});
