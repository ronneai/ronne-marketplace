import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
};

test("root reads the audit log: setup, and its own sign-in", async ({ page }) => {
  await signIn(page, E2E_USERS.root);
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "instance.root_created" })).toHaveCount(1);
  await expect(
    rows.filter({ hasText: "auth.signed_in" }).filter({ hasText: E2E_USERS.root }).first(),
  ).toBeVisible();

  // The filter is a plain GET form.
  await page.getByLabel("Action").selectOption("instance");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/group=instance/);
  await expect(rows.filter({ hasText: "auth.signed_in" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "instance.root_created" })).toHaveCount(1);
});

test("anyone but root gets a 404", async ({ page }) => {
  await signIn(page, E2E_USERS.notRoot);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  const response = await page.goto("/admin/audit");
  expect(response?.status()).toBe(404);
});
