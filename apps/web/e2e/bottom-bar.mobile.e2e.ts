import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/**
 * Feature 067: the phone action bar sticks to the bottom of the screen while the page scrolls,
 * and is still on screen with a field focused. At the very end of a page it rests on the footer.
 * The styleguide shows it (root-only in production).
 */
test("the action bar stays at the bottom of the screen", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  await page.goto("/styleguide");
  const bar = page.getByRole("toolbar", { name: "Demo actions" });
  const place = async () => {
    const box = await bar.boundingBox();
    const height = await page.evaluate(() => window.visualViewport?.height ?? innerHeight);
    expect(box, "the bar is shown").not.toBeNull();
    return { top: box?.y ?? 0, bottom: (box?.y ?? 0) + (box?.height ?? 0), height };
  };
  // At the top of a long page, the bar is already at the bottom of the screen.
  let at = await place();
  expect(Math.abs(at.bottom - at.height)).toBeLessThanOrEqual(2);
  await page.evaluate(() => window.scrollBy(0, 600));
  at = await place();
  expect(Math.abs(at.bottom - at.height)).toBeLessThanOrEqual(2);
  // A focused field near the end: the bar is still whole on screen (on the footer, there).
  await page.getByLabel("A field to type in").focus();
  at = await place();
  expect(at.top).toBeGreaterThanOrEqual(0);
  expect(at.bottom).toBeLessThanOrEqual(at.height + 1);
  await expect(bar.getByRole("button", { name: "Submit" })).toBeVisible();
});
