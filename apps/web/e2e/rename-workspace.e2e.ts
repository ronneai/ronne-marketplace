import { test } from "@playwright/test";
import { renameAsAdmin } from "./rename-workspace";
import { E2E_PASSWORD, E2E_RENAME, E2E_USERS } from "./users";

test("a workspace's admin renames it, and its address and items follow (113)", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS[E2E_RENAME.projects.chromium]);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await renameAsAdmin(page, "chromium");
});
