import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_TWIN, E2E_USERS } from "./users";

const TWIN_NAME = `@${E2E_TWIN.workspace}/${E2E_TWIN.scope}/${E2E_TWIN.item}`;

/** A workspace's item on a phone (118): listed, opened, and installed with its full name. */
test("a workspace's item is listed, opened and installed by its full name", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.phoneTwinReader);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/catalogue?q=${E2E_TWIN.item}`);
  await expect(
    page.getByRole("link", { name: `@${E2E_SCOPE}/${E2E_TWIN.item}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: TWIN_NAME, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TWIN_NAME);
  // What to install it with, by its full name; global's twin by its own.
  await expect(page.getByText(`rmk install ${TWIN_NAME}`).first()).toBeVisible();
  await page.goto(`/items/${E2E_SCOPE}/${E2E_TWIN.item}`);
  await expect(page.getByText(`rmk install @${E2E_SCOPE}/${E2E_TWIN.item}`).first()).toBeVisible();
});
