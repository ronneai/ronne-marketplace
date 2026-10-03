import { expect, type Locator, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/** On screen: inside the visual viewport, all of it. */
const onScreen = async (page: Page, locator: Locator) => {
  const box = await locator.boundingBox();
  const { width, height } = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
  }));
  expect(box, "has a box").not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
};

/**
 * Feature 067: a dialog on a phone fills the screen, with its title at the top and its buttons at
 * the bottom, both in view while a field has focus. On a tablet it's the usual centred panel.
 */
test("a dialog keeps its title and buttons in view", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  await page.goto("/account/tokens");
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog", { name: "Create access token" });
  await expect(dialog).toBeVisible();

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await dialog.boundingBox();
  if (viewport.width < 640) {
    // Below sm: the whole screen.
    expect(box?.width).toBeCloseTo(viewport.width, 0);
    expect(box?.height).toBeCloseTo(viewport.height, 0);
  } else {
    expect(box?.width ?? 0).toBeLessThan(viewport.width);
  }

  await dialog.getByLabel("Name").focus();
  await onScreen(page, dialog.getByRole("heading", { name: "Create access token" }));
  await onScreen(page, dialog.getByRole("button", { name: "Close" }));
  await onScreen(page, dialog.getByRole("button", { name: "Create token" }));
  const close = await dialog.getByRole("button", { name: "Close" }).boundingBox();
  expect(close?.height).toBeGreaterThanOrEqual(44);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
