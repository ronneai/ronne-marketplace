import { expect, test } from "@playwright/test";
import { expectInTheCorner, toastBox, toastIsOnTop, viewportOf } from "./toast";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 138: on a desktop a toast is at the bottom right, 16px from the edges, and is seen over
 * a modal dialog's backdrop. The styleguide has a button for each kind.
 */
test("a toast is at the bottom right and above an open dialog", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.root);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/styleguide");

  // The region is in the page and named, empty, before anything is said.
  await expect(page.getByRole("region", { name: "Notifications" })).toBeAttached();
  await page.getByRole("button", { name: "Show OK" }).click();
  const screen = await viewportOf(page);
  const box = await toastBox(page, "ok");
  expectInTheCorner(box, screen);
  expect(Math.abs(box.y + box.height - (screen.height - 16))).toBeLessThanOrEqual(2);
  await expect(page.locator("[data-toast-kind=ok]")).toContainText("OK:");
  // Gone by itself after five seconds.
  await expect(page.locator("[data-toast-kind=ok]")).toHaveCount(0, { timeout: 9000 });

  // An error stays until it is closed, with a labelled button.
  await page.getByRole("button", { name: "Show error" }).click();
  await expect(page.locator("[data-toast-kind=error]")).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(page.locator("[data-toast-kind=error]")).toBeVisible();
  await page.getByRole("button", { name: "Close notification" }).click();
  await expect(page.locator("[data-toast-kind=error]")).toHaveCount(0);

  // Over a modal dialog: seen above its backdrop.
  await page.getByRole("button", { name: "Open dialog" }).first().click();
  await expect(page.getByRole("dialog", { name: "Create user" })).toBeVisible();
  await page.getByRole("button", { name: "Toast from here" }).click();
  await toastBox(page, "ok");
  expect(await toastIsOnTop(page, "ok")).toBe(true);
});
