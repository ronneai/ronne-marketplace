import { expect, test } from "@playwright/test";
import { headerName } from "./helpers";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

test("the header's theme switch sticks, and the account menu closes", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.notRoot);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES.notRoot)).toBeVisible();

  const html = page.locator("html");
  // The browser bar follows the header's colour (feature 065).
  const themeColor = page.locator('meta[name="theme-color"]');
  const toggle = page.getByRole("banner").getByRole("button", { name: /^Switch to the/ });
  // No saved choice: light.
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(themeColor).toHaveAttribute("content", "#14213d");
  await page.reload();
  await expect(themeColor).toHaveAttribute("content", "#14213d");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");

  // The account menu closes on a click outside, on Esc and on a change of page (066).
  const summary = page.getByRole("banner").locator("summary");
  const details = page.getByRole("banner").locator("details");
  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(details).not.toHaveAttribute("open");
  await summary.click();
  await page.keyboard.press("Escape");
  await expect(details).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();
  await summary.click();
  await page.getByRole("banner").getByRole("link", { name: "Access tokens" }).click();
  await expect(page).toHaveURL(/\/account\/tokens$/);
  await expect(details).not.toHaveAttribute("open");
});
