import { describe, expect, it } from "vitest";
import { ciScope } from "./ci-scope.js";

const none = { image: false, server: false, install: false, clients: false };
const all = { image: true, server: true, install: true, clients: true };

describe("ciScope", () => {
  it("runs none of the slow suites for app and docs changes", () => {
    expect(
      ciScope([
        "apps/web/src/features/catalogue/Catalogue.tsx",
        "apps/web/src/server/http/registry-api.ts",
        "docs/features/095-workspaces-cli-api/PLAN.md",
        "packages/repo-tools/src/witness.js",
      ]),
    ).toEqual(none);
  });

  it("runs the clients on Windows for rmk, rmk-mcp, the core under them and the build graph (121)", () => {
    for (const file of [
      "packages/cli/src/search.ts",
      "packages/mcp/src/server.ts",
      "packages/core/src/schema/ronne.schema.json",
      ".github/workflows/clients-windows.yml",
      "turbo.json",
    ])
      expect(ciScope([file]).clients, file).toBe(true);
    expect(ciScope(["apps/web/src/server/http/registry-api.ts"]).clients).toBe(false);
  });

  it("runs the image for what the image adds", () => {
    for (const file of [
      "Dockerfile",
      ".dockerignore",
      "compose.yaml",
      "docker/pnpm",
      ".github/actions/build-image/install-probe.sh",
      ".github/workflows/image.yml",
      "apps/web/scripts/setup.ts",
    ])
      expect(ciScope([file]), file).toEqual({ ...none, image: true });
  });

  it("runs the server package for the server, its bundles, packages and services", () => {
    for (const file of [
      "packages/server/src/cli.ts",
      "packaging/linux/nfpm.yaml",
      "scripts/service/test-linux-service.sh",
      "scripts/packages/test-in-containers.sh",
      "packages/repo-tools/src/bundle.js",
      "packages/repo-tools/src/server-probe.js",
      ".github/workflows/server-checks.yml",
      ".github/workflows/bundles.yml",
      ".github/workflows/packages.yml",
    ])
      expect(ciScope([file]), file).toEqual({ ...none, server: true });
  });

  it("runs the install scripts, and the image that runs install.sh, for the scripts", () => {
    expect(ciScope(["scripts/install/install.sh"])).toEqual({
      ...none,
      image: true,
      install: true,
    });
    expect(ciScope(["packages/repo-tools/src/release-install-scripts.js"])).toEqual({
      ...none,
      install: true,
    });
  });

  it("runs the image and the server for the web app's build config", () => {
    expect(ciScope(["apps/web/next.config.ts"])).toEqual({ ...none, image: true, server: true });
  });

  it("runs the image and the server for backup and restore, which their smoke tests restore (099)", () => {
    for (const file of [
      "apps/web/src/server/backup/restore.ts",
      "apps/web/scripts/backup.ts",
      "apps/web/scripts/restore.ts",
    ])
      expect(ciScope([file]), file).toEqual({ ...none, image: true, server: true });
  });

  it("runs every suite for the dependencies, the Node version and the detection itself", () => {
    for (const file of [
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "package.json",
      "apps/web/package.json",
      ".nvmrc",
      ".github/workflows/changes.yml",
      "packages/repo-tools/src/ci-scope.js",
    ])
      expect(ciScope([file]), file).toEqual(all);
  });

  it("runs everything when it can't tell (an empty list)", () => {
    expect(ciScope([])).toEqual(all);
  });
});
