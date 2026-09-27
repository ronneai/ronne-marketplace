import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

// Next.js's route announcer is also a role="alert", so match the notice by its ERR: prefix.
const errorNotice = (page: Page) => page.getByRole("alert").filter({ hasText: "ERR:" });

async function signIn(page: Page, email: string, password = E2E_PASSWORD, remember = false) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  if (remember) await page.getByLabel("Remember me (30 days)").check();
  await page.getByRole("button", { name: "Sign in" }).click();
}

const sessionCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "ronne.session_token");

test("signs in and comes back to the page that was asked for", async ({ page }) => {
  await page.goto("/account/password");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Fpassword$/);
  await expect(page.getByRole("heading", { name: "Sign in to Ronne" })).toBeVisible();

  await signIn(page, E2E_USERS.root);
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByText(E2E_USERS.root, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
});

test("a wrong password and an unknown email get the same error", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, E2E_USERS.wrongPassword, "not the password at all");
  await expect(errorNotice(page)).toContainText("Email or password is wrong");
  // The email stays; the password doesn't.
  await expect(page.getByLabel("Email")).toHaveValue(E2E_USERS.wrongPassword);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");

  await signIn(page, "nobody@e2e.test");
  await expect(errorNotice(page)).toContainText("Email or password is wrong");
  expect(await sessionCookie(page)).toBeUndefined();
});

test("remember me gives a 30-day cookie; without it, a browser-session cookie", async ({
  browser,
}) => {
  const remembered = await browser.newPage();
  await remembered.goto("/sign-in");
  await signIn(remembered, E2E_USERS.remember, E2E_PASSWORD, true);
  await expect(remembered).toHaveURL(/\/$/);
  const days = (((await sessionCookie(remembered))?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);

  const forgotten = await browser.newPage();
  await forgotten.goto("/sign-in");
  await signIn(forgotten, E2E_USERS.remember);
  await expect(forgotten).toHaveURL(/\/$/);
  expect((await sessionCookie(forgotten))?.expires).toBe(-1);
});

test("signs out, and the back button doesn't show the page again", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, E2E_USERS.signOut);
  await expect(page.getByText(E2E_USERS.signOut, { exact: true })).toBeVisible();

  await page.getByText(E2E_USERS.signOut, { exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await sessionCookie(page)).toBeUndefined();

  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(E2E_USERS.signOut, { exact: true })).toHaveCount(0);
});

test("changes the password: this browser stays in, others are signed out", async ({ browser }) => {
  const here = await browser.newPage();
  const elsewhere = await browser.newPage();
  for (const page of [here, elsewhere]) {
    await page.goto("/sign-in");
    await signIn(page, E2E_USERS.changePassword);
    await expect(page.getByText(E2E_USERS.changePassword, { exact: true })).toBeVisible();
  }

  const next = "a brand new e2e passphrase";
  await here.goto("/account/password");
  await here.getByLabel("Current password").fill("not the password at all");
  await here.getByLabel("New password", { exact: true }).fill(next);
  await here.getByLabel("Confirm new password").fill(next);
  await here.getByRole("button", { name: "Change password" }).click();
  await expect(here.getByText("The current password is wrong")).toBeVisible();

  await here.getByLabel("Current password").fill(E2E_PASSWORD);
  await here.getByLabel("New password", { exact: true }).fill(next);
  await here.getByLabel("Confirm new password").fill(next);
  await here.getByRole("button", { name: "Change password" }).click();
  await expect(here.getByText("Password changed")).toBeVisible();

  await here.goto("/");
  await expect(here.getByText(E2E_USERS.changePassword, { exact: true })).toBeVisible();
  await elsewhere.goto("/");
  await expect(elsewhere).toHaveURL(/\/sign-in$/);

  await signIn(elsewhere, E2E_USERS.changePassword, next);
  await expect(elsewhere.getByText(E2E_USERS.changePassword, { exact: true })).toBeVisible();
});
