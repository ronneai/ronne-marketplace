import { defineConfig } from "tsdown";

/**
 * The setup, migrate and reset-root-password commands, compiled to plain JS for the Docker image
 * (feature 005), which has no dev dependencies and no TypeScript runner. Everything is bundled except
 * the native modules, which ship next to the Next.js standalone output. The output sits one level
 * under the app, like scripts/, so the scripts still find the app folder from their own location.
 */
const NATIVE = ["better-sqlite3", "@node-rs/argon2"];
const packageName = (id: string) =>
  id.startsWith("@") ? id.split("/").slice(0, 2).join("/") : id.split("/")[0];

export default defineConfig({
  entry: {
    setup: "scripts/setup.ts",
    migrate: "scripts/migrate.ts",
    "reset-root-password": "scripts/reset-root-password.ts",
    start: "scripts/start.ts",
  },
  outDir: "dist-scripts",
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  deps: {
    alwaysBundle: (id) =>
      id.startsWith(".") || id.startsWith("/")
        ? undefined
        : !NATIVE.includes(packageName(id) ?? ""),
    neverBundle: NATIVE,
    // Fails the build if the output would import anything else from node_modules.
    onlyImport: NATIVE,
  },
});
