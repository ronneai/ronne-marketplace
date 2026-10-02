import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("root creates a scope; everyone sees it, but only root can manage scopes", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root);
  await root.goto("/admin/scopes");
  await root.getByRole("button", { name: "Create scope" }).click();
  const dialog = root.getByRole("dialog");
  await dialog.getByLabel("Name").fill("@E2E-Team");
  await expect(dialog.getByText("@e2e-team/item")).toBeVisible();
  await dialog.getByLabel("Description").fill("Items from the end-to-end tests.");
  await dialog.getByRole("button", { name: "Create scope" }).click();
  await expect(dialog.getByText("Created @e2e-team.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("cell", { name: "@e2e-team", exact: true })).toBeVisible();

  const user = await browser.newPage();
  await signIn(user, E2E_USERS.notRoot);
  await user
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Scopes" })
    .click();
  await expect(user.getByRole("cell", { name: "@e2e-team", exact: true })).toBeVisible();
  await expect(user.getByRole("button", { name: /Edit @/ })).toHaveCount(0);
  // Sorted on the server (061): newest first by Created, and the view stays in the URL.
  await user.getByRole("link", { name: "Created" }).click();
  await expect(user).toHaveURL(/sort=created/);
  await expect(user.getByRole("row").nth(1)).toContainText("@e2e-team");
  await user.getByLabel("Search").fill("end-to-end");
  await expect(user).toHaveURL(/q=end-to-end/);
  await expect(user.getByRole("cell", { name: "@e2e-team", exact: true })).toBeVisible();
  expect((await user.goto("/admin/scopes"))?.status()).toBe(404);
});
