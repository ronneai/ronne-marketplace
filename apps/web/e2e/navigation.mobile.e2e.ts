import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { E2E_SCOPE, E2E_SKILL } from "./users";

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
  // And the sidebar's switcher and Propose item (119).
  for (const name of ["Home", "Catalogue", "Submissions", "CLI & tokens", "Account"])
    await expect(sheet.getByRole("link", { name, exact: true })).toBeVisible();
  // Reviews' name carries its count, when some wait.
  await expect(sheet.getByRole("link", { name: /^Reviews/ })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /^Documentation/ })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Propose item" })).toBeVisible();
  await expect(sheet.locator("summary").first()).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Switch to the/ })).toBeVisible();

  // Esc, and focus goes back to Menu.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(menu).toBeFocused();

  // A link: the page changes and the sheet is gone.
  await menu.click();
  await sheet.getByRole("link", { name: "Catalogue", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(sheet).toBeHidden();

  // Back, with the sheet open; it marks the page you're on.
  await menu.click();
  await expect(sheet.getByRole("link", { name: "Catalogue", exact: true })).toHaveAttribute(
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

  // The workspace switcher (120): choosing their personal workspace makes it the current one, on
  // the same page, and closes the sheet; its row's Open page link opens the workspace's page.
  const before = new URL(page.url()).pathname;
  await menu.click();
  const summary = sheet.locator("summary").first();
  await expect(summary).toContainText("All workspaces");
  await summary.click();
  await sheet.getByRole("link").filter({ hasText: "personal" }).click();
  await expect(page).toHaveURL((url) => url.pathname === before);
  await expect(sheet).toBeHidden();
  await menu.click();
  await expect(summary).toContainText("Personal workspace");
  await summary.click();
  const open = sheet.getByRole("link", { name: /^Open .+'s page$/ }).first();
  const href = (await open.getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/workspaces\/[^/]+$/);
  await open.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(sheet).toBeHidden();
});

/** Inside the viewport, sideways: a tab a strip scrolled to, not one off its edge. */
const sidewaysOnScreen = async (box: { x: number; width: number } | null, width: number) => {
  expect(box, "has a box").not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
};

// Feature 066: a tab strip that doesn't fit shows its current tab, and fades the edge with more.
test("tab strips show the current tab", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "moderator"));
  const width = page.viewportSize()?.width ?? 0;

  // The last of the item page's tabs, opened by its URL.
  await page.goto(`/items/@${E2E_SCOPE}/${E2E_SKILL}?tab=risks`);
  const strip = page.getByRole("navigation", { name: "Item" });
  const risks = strip.locator('[aria-current="page"]');
  await expect(risks).toContainText("What it can do");
  await expect
    .poll(async () => (await risks.boundingBox())?.x ?? -1, { message: "scrolled into view" })
    .toBeGreaterThanOrEqual(0);
  await sidewaysOnScreen(await risks.boundingBox(), width);
  // On one line: the strip scrolls rather than squeezing a label (a 44px tab at most).
  expect((await risks.boundingBox())?.height ?? 0).toBeLessThanOrEqual(48);
  // A strip scrolled to its end fades its start, if it had to scroll at all.
  const scrolls = await strip.evaluate((el) => el.scrollWidth > el.clientWidth);
  if (scrolls) await expect(strip).toHaveClass(/\bfade-(start|both)\b/);
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
    for (const name of ["Home", "Catalogue", "Submissions", "Users", "Audit log"])
      await expect(main.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Reviews/ })).toBeVisible();
    // Documentation opens the website in a new tab (088).
    const docs = main.getByRole("link", { name: /^Documentation/ });
    await expect(docs).toHaveAttribute("href", "https://www.ronne.ai/marketplace/docs");
    await expect(docs).toHaveAttribute("target", "_blank");
    // The sidebar's switcher and Propose item work without JavaScript too (119).
    await expect(main.getByRole("link", { name: "Propose item" })).toHaveAttribute(
      "href",
      "/submissions/new",
    );
    await main.locator("summary").first().click();
    await expect(main.getByRole("link", { name: "All workspaces" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Manage workspaces" })).toBeVisible();
    await main.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
