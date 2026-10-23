import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATED_ROUTES, SWEEP_PAGES } from "../../e2e/pages";

// Every page.tsx under app/, as its route: route groups like (app) aren't part of the URL.
const appDir = new URL(".", import.meta.url).pathname;
const routes = (readdirSync(appDir, { recursive: true }) as string[])
  .filter((file) => file.endsWith(`${sep}page.tsx`) || file === "page.tsx")
  .map(
    (file) =>
      `/${relative(appDir, join(appDir, file))
        .split(sep)
        .slice(0, -1)
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .join("/")}`,
  );

describe("the phone sweep's page list (feature 065)", () => {
  it("lists every page in the app, and nothing that isn't one", () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(SWEEP_PAGES.map((page) => page.route).sort()).toEqual([...routes].sort());
  });

  it("opens at least one URL for every page it doesn't skip", () => {
    const data = { draftId: "d", submissionId: "s", personal: "p", userId: "u" };
    for (const page of SWEEP_PAGES.filter((p) => !p.skip))
      for (const role of page.roles === "signedOut" ? (["member"] as const) : page.roles)
        expect(page.urls(data, role).length, `${page.route} as ${role}`).toBeGreaterThan(0);
  });

  it("runs the migrated pages (129) in every language, and only pages it lists", () => {
    const listed = new Set(SWEEP_PAGES.map((page) => page.route));
    for (const route of MIGRATED_ROUTES) expect(listed.has(route), route).toBe(true);
    // Pinned: dropping a page from the language sweeps has to be a decision, made here.
    expect([...MIGRATED_ROUTES].sort()).toEqual(
      [
        "/",
        "/account/language",
        "/account/password",
        "/account/security",
        "/account/tokens",
        "/admin/settings",
        "/admin/feedback",
        "/workspaces",
        "/workspaces/[name]",
        "/workspaces/[name]/join",
        "/workspaces/requests",
        "/catalogue",
        "/items/[scope]/[name]",
        "/items/[scope]/[name]/versions",
        "/workspaces/[name]/items/[scope]/[item]",
        "/workspaces/[name]/items/[scope]/[item]/versions",
        "/device",
        "/menu",
        "/feedback",
        "/sign-in",
        "/sign-in/two-factor",
        "/submissions/new",
        "/submissions/[id]",
        "/submissions",
        "/reviews",
      ].sort(),
    );
  });
});
