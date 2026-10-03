import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/**
 * Feature 066: below `lg` the header is the logo and Menu, and the Menu's side sheet holds the
 * navigation. It closes on Esc, a link, back, and a tap outside (where the sheet leaves room: on a
 * phone it fills the screen, so its Close button does).
 */
test("the Menu opens the navigation and closes on Esc, a link, back and outside", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "moderator"));
  const banner = page.getByRole("banner");
  const menu = banner.getByRole("button", { name: /^Menu/ });
  const sheet = page.getByRole("dialog", { name: "Menu" });

  // The strip and the account menu are hidden; Menu is there.
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(banner.locator("summary")).toBeHidden();

  // Every link for the role, and the account part.
  await menu.click();
  await expect(sheet).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Home", "Catalogue", "Submissions", "Reviews", "Docs", "Access tokens"])
    await expect(sheet.getByRole("link", { name }).first()).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Switch to the/ })).toBeVisible();

  // Esc, and focus goes back to Menu.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(menu).toBeFocused();

  // A link: the page changes and the sheet is gone.
  await menu.click();
  await sheet.getByRole("link", { name: "Catalogue" }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(sheet).toBeHidden();

  // Back, with the sheet open; it marks the page you're on.
  await menu.click();
  await expect(sheet.getByRole("link", { name: "Catalogue" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page).not.toHaveURL(/\/catalogue$/);
  await expect(sheet).toBeHidden();

  // Outside the sheet, or its Close button where the sheet is the whole screen.
  await menu.click();
  const box = await sheet.boundingBox();
  if (box && box.x > 40) await page.mouse.click(box.x / 2, box.y + box.height / 2);
  else await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(menu).toBeFocused();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  // Root here: the moderator signs in above and in the sweep, the member in the smoke test and
  // the sweep (e2e-sign-in-limit.md).
  test("Menu is a link to /menu, which lists the links and signs out", async ({
    page,
  }, testInfo) => {
    await signIn(page, mobileUser(testInfo, "root"));
    await page.getByRole("banner").getByRole("link", { name: /^Menu/ }).click();
    await expect(page).toHaveURL(/\/menu$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Menu" })).toBeVisible();
    for (const name of ["Home", "Catalogue", "Submissions", "Reviews", "Admin", "Docs"])
      await expect(main.getByRole("link", { name }).first()).toBeVisible();
    await main.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await page.goto("/menu");
    await main.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
