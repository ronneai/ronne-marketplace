import { expect, type Locator, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { E2E_DOOR, E2E_PINS } from "./users";

const FULL = `@${E2E_PINS.workspace}/${E2E_PINS.scope}/${E2E_PINS.item}`;
const DOOR_FULL = `@${E2E_DOOR.workspace}/${E2E_DOOR.scope}/${E2E_DOOR.item}`;
const DOOR = `/workspaces/${E2E_DOOR.workspace}/items/${E2E_DOOR.scope}/${E2E_DOOR.item}`;
const ITEM = `/workspaces/${E2E_PINS.workspace}/items/${E2E_PINS.scope}/${E2E_PINS.item}`;

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

const tall = async (locator: Locator, min = 44) => {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0, "a touch target").toBeGreaterThanOrEqual(min);
};

/**
 * Feature 125 on a phone and a tablet: an admin pins an item from its page. The Pin dialog fills
 * the phone's screen like every dialog (067), its title and Done in view, its buttons 44px tall;
 * Manage shows the shelf in the same dialog and Remove empties it.
 */
test("the Pin menu and Manage fit the screen and work by touch", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "pinsAdmin"));
  await page.goto(ITEM);
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  // The dialog's title changes with its view (Pin, then Manage), and so does its name.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: `Pin ${FULL}` })).toBeVisible();

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await dialog.boundingBox();
  if (viewport.width < 640) {
    expect(box?.width).toBeCloseTo(viewport.width, 0);
    expect(box?.height).toBeCloseTo(viewport.height, 0);
  } else {
    expect(box?.width ?? 0).toBeLessThan(viewport.width);
  }
  await onScreen(page, dialog.getByRole("heading"));
  await onScreen(page, dialog.getByRole("button", { name: "Done" }));
  await tall(dialog.getByRole("button", { name: "Done" }));

  const pin = dialog.getByRole("button", { name: `Pin ${FULL} to ${E2E_PINS.workspace}` });
  await tall(pin);
  await pin.click();
  const row = dialog.getByRole("listitem").filter({ hasText: E2E_PINS.workspace });
  await expect(row.getByText("Pinned", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: `Manage ${E2E_PINS.workspace}` }).click();
  await expect(dialog.getByRole("heading", { name: `Manage ${E2E_PINS.workspace}` })).toBeVisible();
  await expect(dialog.getByText("1 of 12 pinned")).toBeVisible();
  await expect(dialog.getByText(FULL)).toBeVisible();
  const remove = dialog.getByRole("button", { name: `Remove ${FULL}` });
  await tall(remove);
  await tall(dialog.getByRole("button", { name: `Move ${FULL} up` }));
  await onScreen(page, remove);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no sideways scroll",
  ).toBe(true);
  // A second item on the shelf, to order the two by touch.
  await dialog.getByRole("button", { name: "Back" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.goto(DOOR);
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await dialog.getByRole("button", { name: `Pin ${DOOR_FULL} to ${E2E_PINS.workspace}` }).click();
  await expect(row.getByText("Pinned", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: `Manage ${E2E_PINS.workspace}` }).click();
  await expect(dialog.getByText("2 of 12 pinned")).toBeVisible();
  const names = () => dialog.getByRole("listitem").locator("span.font-mono");
  await expect(names()).toHaveText([FULL, DOOR_FULL]);
  // The first can't move up, the last can't move down.
  await expect(dialog.getByRole("button", { name: `Move ${FULL} up` })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: `Move ${DOOR_FULL} down` })).toBeDisabled();
  await dialog.getByRole("button", { name: `Move ${DOOR_FULL} up` }).click();
  await expect(names()).toHaveText([DOOR_FULL, FULL]);
  await dialog.getByRole("button", { name: `Move ${DOOR_FULL} down` }).click();
  await expect(names()).toHaveText([FULL, DOOR_FULL]);
  await dialog.getByRole("button", { name: `Remove ${DOOR_FULL}` }).click();
  await expect(names()).toHaveText([FULL]);
  await dialog.getByRole("button", { name: `Remove ${FULL}` }).click();
  await expect(dialog.getByText("Nothing is pinned here yet.")).toBeVisible();

  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(row.getByText("Pinned", { exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
