import { expect, test } from "@playwright/test";
import { headerName } from "./helpers";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

test("the header's theme switch toggles light and dark, and it sticks", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.notRoot);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES.notRoot)).toBeVisible();

  const html = page.locator("html");
  const toggle = page.getByRole("banner").getByRole("button", { name: /^Switch to the/ });
  // No saved choice: light.
  await expect(html).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
});
