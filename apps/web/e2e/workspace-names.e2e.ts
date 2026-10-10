import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_TWIN, E2E_USERS } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;
const GLOBAL_NAME = `@${E2E_SCOPE}/${E2E_TWIN.item}`;
const TWIN_NAME = `@${E2E_TWIN.workspace}/${E2E_TWIN.scope}/${E2E_TWIN.item}`;

/**
 * The workspace in item names (118): one scope and name in two workspaces are two items, each
 * listed, opened and installed by its full name.
 */
test("two workspaces' same-named items are listed, opened and installed apart", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.twinReader);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(`/catalogue?q=${E2E_TWIN.item}`);
  await expect(page.getByRole("link", { name: GLOBAL_NAME, exact: true })).toBeVisible();
  await page.getByRole("link", { name: TWIN_NAME, exact: true }).click();
  await expect(page).toHaveURL(
    `/workspaces/${E2E_TWIN.workspace}/items/${E2E_TWIN.scope}/${E2E_TWIN.item}`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TWIN_NAME);

  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.twinReader, password: E2E_PASSWORD, name: "e2e twins" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: mkdtempSync(join(tmpdir(), "rmk-twins-home-")),
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  for (const name of [GLOBAL_NAME, TWIN_NAME]) {
    const project = mkdtempSync(join(tmpdir(), "rmk-twins-"));
    mkdirSync(join(project, ".claude"));
    execFileSync("node", [BIN, "install", name, "--target", "claude-code"], {
      cwd: project,
      env,
      encoding: "utf8",
    });
    const lock = JSON.parse(readFileSync(join(project, "rmk.lock"), "utf8"));
    expect(Object.keys(lock.items)).toEqual([name]);
  }
});
