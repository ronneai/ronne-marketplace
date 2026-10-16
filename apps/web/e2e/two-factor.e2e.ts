import { expect, type Page, test } from "@playwright/test";
import { totpCode } from "../src/server/domains/identity/testing/totp";
import { headerName } from "./helpers";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

// Two-factor on /account/security (105): each step the page goes through, in a real browser.
// Turning it on and off replaces the session, and Next.js renders the page again: the steps must
// survive that.

/** The code an authenticator app would show for the key on the page (its groups of four). */
const codeFor = async (page: Page, step = 0) => {
  const key = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  return totpCode(`otpauth://totp/x?secret=${key}`, { step });
};

test("turn two-factor on, keep the backup codes, make new ones, and turn it off", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.twoFactor);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES.twoFactor)).toBeVisible();

  // Reached from Account: the Password tab, then Two-factor sign-in.
  await page.goto("/account/password");
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "Two-factor sign-in" })
    .click();
  await expect(page).toHaveURL(/\/account\/security$/);
  const panel = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(panel.getByText("Off", { exact: true })).toBeVisible();

  // The password, then the QR code and the key; a reload and the password again: the same key.
  await page.getByLabel("Your password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const key = await page.locator("code").first().innerText();
  await page.reload();
  await page.getByLabel("Your password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  await expect(page.locator("code").first()).toHaveText(key);

  // A wrong first code, then the right one: on, and the ten backup codes, once.
  await page.getByLabel("Code from the app").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("That code is wrong.")).toBeVisible();
  await page.getByLabel("Code from the app").fill(await codeFor(page));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Two-factor sign-in is on" }),
  ).toBeVisible();
  const codes = page.getByRole("list", { name: "Backup codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  // The badge says what's true while the codes are shown.
  await expect(panel.getByText("On", { exact: true })).toBeVisible();
  const firstCodes = await codes.allInnerTexts();
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByRole("list", { name: "Backup codes" })).toHaveCount(0);
  await expect(panel.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("10 backup codes left.")).toBeVisible();
  // Gone for good: not on the page after a reload either.
  await page.reload();
  await expect(page.getByText("10 backup codes left.")).toBeVisible();
  for (const code of firstCodes) await expect(page.getByText(code)).toHaveCount(0);

  // New backup codes: ten others, and "I've saved them" closes them and brings the form back.
  const regenerate = page.getByRole("form", { name: "New backup codes" });
  await regenerate.getByLabel("Your password").fill(E2E_PASSWORD);
  await regenerate.getByRole("button", { name: "Make new backup codes" }).click();
  await expect(codes).toHaveCount(10);
  const newCodes = await codes.allInnerTexts();
  expect(newCodes.filter((code) => firstCodes.includes(code))).toEqual([]);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByRole("list", { name: "Backup codes" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "New backup codes" })).toBeVisible();

  // Turn off with the password and a new backup code: the notice, then Done shows it off.
  const turnOff = page.getByRole("form", { name: "Turn off two-factor" });
  await turnOff.getByLabel("Your password").fill(E2E_PASSWORD);
  await turnOff.getByLabel("A code from the app, or a backup code").fill(newCodes[0] ?? "");
  await turnOff.getByRole("button", { name: "Turn off two-factor" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Two-factor sign-in is off" }),
  ).toBeVisible();
  // Off now, and nothing that needs it on is offered while the notice is shown.
  await expect(panel.getByText("Off", { exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: "New backup codes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(panel.getByText("Off", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up two-factor" })).toBeVisible();
});
