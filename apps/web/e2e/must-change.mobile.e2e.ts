import { expect, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { recordSecret } from "./secrets";
import { describeOverflow, measureOverflow, overflows } from "./sweep";
import { E2E_PASSWORD } from "./users";

/** On screen: inside the visual viewport, all of it. */
const onScreen = async (page: Page, name: string) => {
  const box = await page.getByRole("button", { name }).boundingBox();
  const height = await page.evaluate(() => window.visualViewport?.height ?? innerHeight);
  expect(box, "has a box").not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
};

/**
 * Feature 128 on a phone and a tablet: someone root asked to choose a new password is held on the
 * change page, which fits the screen, has fields a thumb can hit, keeps its button in view while a
 * field is focused, and takes them to Home once they have chosen.
 */
test("the held change-password page fits the screen and ends at Home", async ({
  page,
  baseURL,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "mustChange"));
  await expect(page).toHaveURL(/\/account\/password/);
  await expect(page.getByText("Choose your own password to continue")).toBeVisible();

  const overflow = await measureOverflow(page);
  expect(overflows(overflow), describeOverflow(overflow)).toBe(false);

  // The longer French and Portuguese texts fit too: pick them the way the sign-in links do.
  for (const [locale, title] of [
    ["fr", "Choisissez votre propre mot de passe pour continuer"],
    ["pt", "Escolha sua própria senha para continuar"],
  ] as const) {
    await page.context().addCookies([{ name: "ronne-locale", value: locale, url: baseURL ?? "/" }]);
    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
    const longer = await measureOverflow(page);
    expect(overflows(longer), `${locale}: ${describeOverflow(longer)}`).toBe(false);
  }
  await page.context().clearCookies({ name: "ronne-locale" });
  await page.reload();
  await expect(page.getByText("Choose your own password to continue")).toBeVisible();
  for (const label of ["Current password", "New password", "Confirm new password"]) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    expect(box?.height ?? 0, `${label} is a touch target`).toBeGreaterThanOrEqual(44);
  }

  // With a field focused (the keyboard would be up), the button is still on screen.
  await page.getByLabel("New password", { exact: true }).focus();
  await onScreen(page, "Change password");

  const chosen = "my own phone passphrase";
  recordSecret(JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main, chosen);
  await page.getByLabel("Current password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(chosen);
  await page.getByLabel("Confirm new password", { exact: true }).fill(chosen);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).not.toHaveURL(/\/account\/password/);
  await expect(page).toHaveURL(/\/$/);
});
