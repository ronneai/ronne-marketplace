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
