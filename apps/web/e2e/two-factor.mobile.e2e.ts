import { expect, test } from "@playwright/test";
import { totpCode } from "../src/server/domains/identity/testing/totp";
import { mobileUser, signIn } from "./mobile";
import { E2E_PASSWORD } from "./users";

/**
 * Feature 105 on a touch screen: turn two-factor on, sign out, and sign in again with a code from
 * the app. Each project has its own user (two sign-ins of it).
 */
test("turns two-factor on and signs in with a code, on a touch screen", async ({
  page,
}, testInfo) => {
  const email = mobileUser(testInfo, "twoFactor");
  await signIn(page, email);
  await page.goto("/account/security");
  await page.getByLabel("Your password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Set up two-factor" }).tap();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const key = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  const uri = `otpauth://totp/x?secret=${key}`;
  await page.getByLabel("Code from the app").fill(totpCode(uri));
  await page.getByRole("button", { name: "Turn on" }).tap();
  await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(
    10,
  );
  // Nothing wider than the screen: the key, the QR code and the codes fit.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "I've saved them" }).tap();
  // The page settles (it renders again) before the cookies go.
  await expect(page.getByRole("list", { name: "Backup codes" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");

  // Sign out (cookies cleared, as a new visit), then the password and the next code.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).tap();
  await expect(page).toHaveURL(/\/sign-in\/two-factor/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // The code boxes (157) send the form themselves once the sixth digit is in.
  await page
    .getByLabel("Code from your authenticator app")
    .first()
    .fill(totpCode(uri, { step: 1 }));
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("banner")).toBeVisible();
});
