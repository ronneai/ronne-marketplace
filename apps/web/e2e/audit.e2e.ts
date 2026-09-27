import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signed in: the page left /sign-in (the header shows the name, not the email).
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("root reads the audit log: setup, and its own sign-in", async ({ page }) => {
  await signIn(page, E2E_USERS.root);
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  const main = page.getByRole("navigation", { name: "Main" });
  const admin = page.getByRole("navigation", { name: "Admin" });
  const current = (nav: typeof main) => nav.locator('[aria-current="page"]');
  await expect(current(main)).toHaveText("Admin");
  await expect(current(admin)).toHaveText("Users");

  // Client-side navigation keeps the layouts mounted; the highlight must follow anyway.
  await admin.getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(current(admin)).toHaveText("Audit log");
  await expect(current(main)).toHaveText("Admin");
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

  await admin.getByRole("link", { name: "Users" }).click();
  await expect(current(admin)).toHaveText("Users");
  await main.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(current(main)).toHaveText("Home");
});

test("anyone but root gets a 404", async ({ page }) => {
  await signIn(page, E2E_USERS.notRoot);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  const response = await page.goto("/admin/audit");
  expect(response?.status()).toBe(404);
});
