import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/** Feature 065: each phone and tablet project signs in and opens the home page, with touch. */
test("signs in and opens the home page on a touch screen", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "member"));
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  // The layout rules key off a coarse pointer (032, "Phones and tablets").
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const viewport = page.viewportSize();
  expect(viewport?.width).toBeLessThan(1024);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

/** #147: the Forgot? note, with its command, fits a touch screen without scrolling sideways. */
test("opens the Forgot? note on a touch screen", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Forgot your password?" }).tap();
  const note = page.getByRole("dialog", { name: "Forgot your password?" });
  await expect(note.getByText("pnpm run reset-root-password", { exact: true })).toBeVisible();
  await expect(note.getByRole("link", { name: "Root accounts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
