import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { expectInTheCorner, toastBox, toastIsOnTop, viewportOf } from "./toast";

/**
 * Feature 138: on a phone a toast runs across the bottom above the action bar and the home
 * indicator, never over the bar; above a full-screen dialog's buttons. On a tablet it is in the
 * corner, still above the bar. The styleguide has the bar and a button for each kind.
 */
test("a toast sits above the action bar", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  await page.goto("/styleguide");
  const bar = page.getByRole("toolbar", { name: "Demo actions" });
  await expect(bar).toBeVisible();

  await page.getByRole("button", { name: "Show OK" }).click();
  const screen = await viewportOf(page);
  const box = await toastBox(page, "ok");
  const barBox = await bar.boundingBox();
  expectInTheCorner(box, screen);
  // 16px of air above the bar, never over it.
  expect(barBox, "the bar has a box").not.toBeNull();
  // On a tablet the app's bottom navigation is under the bar, so the bar does not end at the
  // screen's edge: the toast has to clear the bar and everything below it.
  if (testInfo.project.name === "tablet") {
    expect(screen.height - ((barBox?.y ?? 0) + (barBox?.height ?? 0))).toBeGreaterThan(40);
  }
  expect(box.y + box.height).toBeLessThanOrEqual((barBox?.y ?? 0) - 12);
  expect(await toastIsOnTop(page, "ok")).toBe(true);
  // The close button is a 44px tap area on touch.
  const close = page
    .locator("[data-toast-kind=ok]")
    .getByRole("button", { name: "Close notification" });
  const closeBox = await close.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
});

test("a toast is seen over an open dialog, above its buttons on a phone", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Open dialog" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create user" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Toast from here" }).click();
  const screen = await viewportOf(page);
  const box = await toastBox(page, "ok");
  expect(await toastIsOnTop(page, "ok")).toBe(true);
  if (screen.width < 640) {
    // The dialog fills the screen: the toast rides above its buttons.
    const actions = await dialog.locator("[data-dialog-actions]").boundingBox();
    expect(actions, "the dialog's buttons have a box").not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual((actions?.y ?? 0) - 12);
  }
});
