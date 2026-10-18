import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

const hold = vi.hoisted(() => ({ requirement: null as null | "reviewers" | "everyone" }));
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
