import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/**
 * Feature 139 on a phone and a tablet: the bell sits in the header beside the Menu, a tap target
 * a thumb can hit, and its panel opens as a screen of its own below `sm` (as every dialog does),
 * a floating panel that fits the window from there, with "See all notifications" in view, closing
 * on Esc with focus back on the bell.
 */
test("the bell is a tap target and opens the panel as a screen that fits", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "feedback"));
  await page.goto("/catalogue");
  const header = page.getByRole("banner");
  const bell = header.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  const box = await bell.boundingBox();
  expect(box?.width ?? 0, "a touch target wide").toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0, "a touch target high").toBeGreaterThanOrEqual(44);
  // Beside the Menu, never over it.
  const menu = await header.getByRole("button", { name: /^Menu/ }).boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(menu?.x ?? 0);

  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  // Exactly one title, whichever surface carries it.
  await expect(panel.getByRole("heading", { name: "Notifications", level: 2 })).toHaveCount(1);
  const seeAll = panel.getByRole("link", { name: "See all notifications" });
  await expect(seeAll).toBeVisible();

  // A screen of its own: as wide as the window, with its foot in view, and nothing scrolls sideways.
  const viewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  const dialog = await panel.boundingBox();
  // Below `sm` (640px) a screen as wide as the window; from there a floating panel that fits it.
  if (viewport.width < 640) expect(dialog?.width ?? 0).toBeGreaterThanOrEqual(viewport.width - 1);
  else {
    expect(dialog?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialog?.x ?? 0) + (dialog?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect(dialog?.width ?? 0).toBeGreaterThan(300);
  }
  const link = await seeAll.boundingBox();
  expect((link?.y ?? 0) + (link?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
  expect(viewport.overflow).toBeLessThanOrEqual(0);
  expect((link?.height ?? 0) >= 44 || (await seeAll.evaluate((a) => a.clientHeight)) >= 20).toBe(
    true,
  );

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});
