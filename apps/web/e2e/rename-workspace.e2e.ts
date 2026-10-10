import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { renameAsAdmin } from "./rename-workspace";
import { E2E_PASSWORD, E2E_RENAME, E2E_USERS } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

test("a workspace's admin renames it, and its address and items follow (113)", async ({
  page,
  request,
}) => {
  const email = E2E_USERS[E2E_RENAME.projects.chromium];
  // A project that installed the item under the workspace's old name.
  const token = await request.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name: "e2e rename" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: mkdtempSync(join(tmpdir(), "rmk-rename-home-")),
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const project = mkdtempSync(join(tmpdir(), "rmk-rename-"));
  mkdirSync(join(project, ".claude"));
  const rmk = (...args: string[]) =>
    execFileSync("node", [BIN, ...args], { cwd: project, env, encoding: "utf8" });
  const item = `${E2E_RENAME.scope}/${E2E_RENAME.item}`;
  const oldName = `@${E2E_RENAME.workspace("chromium")}/${item}`;
  const newName = `@${E2E_RENAME.renamed("chromium")}/${item}`;
  rmk("install", oldName, "--target", "claude-code");
  const lock = () => Object.keys(JSON.parse(readFileSync(join(project, "rmk.lock"), "utf8")).items);
  expect(lock()).toEqual([oldName]);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await renameAsAdmin(page, "chromium");

  // The old name still installs, and the project moves to the new one, saying so.
  expect(rmk("install")).toContain(`${oldName} is now ${newName}`);
  expect(lock()).toEqual([newName]);
});
