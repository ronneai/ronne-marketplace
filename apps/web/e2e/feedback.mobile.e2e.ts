import { expect, type Locator, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/** On screen: inside the visual viewport, all of it. */
const onScreen = async (page: Page, locator: Locator) => {
  const box = await locator.boundingBox();
  const height = await page.evaluate(() => window.visualViewport?.height ?? innerHeight);
  expect(box, "has a box").not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
};

/**
 * Feature 127 on a phone and a tablet: Send feedback is in the Menu, and opens as a page. The kinds
 * are tiles a thumb can hit (44px), the message field keeps the form's buttons in view while it is
 * focused, and sending shows the thanks.
 */
test("Send feedback from the Menu: tiles to tap, the bar in view, thanks", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "feedback"));
  await page.goto("/catalogue");
  await page.getByRole("banner").getByRole("button", { name: /^Menu/ }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await sheet.getByRole("link", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2Fcatalogue$/);
  await expect(page.getByRole("heading", { name: "Send feedback", level: 1 })).toBeVisible();

  for (const kind of ["Problem", "Idea", "Question", "Praise"]) {
    const tile = page.locator("label", { hasText: new RegExp(`^${kind}$`) });
    expect(
      (await tile.boundingBox())?.height ?? 0,
      `${kind} is a touch target`,
    ).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel("Question").check();
  await expect(page.getByLabel("Message")).toHaveAttribute(
    "placeholder",
    "What would you like to know?",
  );

  // With the field focused (the keyboard would be up), the bar with Send is still on screen.
  await page.getByLabel("Message").focus();
  await onScreen(page, page.getByRole("button", { name: "Send feedback" }));
  await page.getByLabel("Message").fill("How do I add a scope?");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks, your feedback was sent")).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
