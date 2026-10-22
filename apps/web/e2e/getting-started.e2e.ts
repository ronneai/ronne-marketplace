import { expect, test } from "@playwright/test";
import { checklist, createToken, progress, useToken, walkThrough } from "./getting-started";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 126 on a desktop browser: the Getting started checklist on Home, hidden, and brought back
 * from Account. Each person signs in once (docs/knowledge/e2e-sign-in-limit.md).
 */
const signIn = async (page: import("@playwright/test").Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
};

test("a hidden checklist comes back from Account, on Home", async ({ page }) => {
  await signIn(page, E2E_USERS.starterAccount);
  await expect(checklist(page)).toBeVisible();
  await expect(progress(page)).toContainText("0 of 4 done");
  // The banner is teal, the inline helpers' panel colour (owner, 2026-10-21), not the plain white.
  const colours = await checklist(page).evaluate((el) => {
    const panel = el.firstElementChild as HTMLElement;
    return { banner: getComputedStyle(panel).backgroundColor, white: "rgb(255, 255, 255)" };
  });
  expect(colours.banner).toBe("rgb(232, 247, 244)");
  expect(colours.banner).not.toBe(colours.white);

  await page.getByRole("button", { name: "Hide Getting started" }).click();
  await expect(checklist(page)).toHaveCount(0);
  // Hidden stays hidden on the next visit.
  await page.goto("/");
  await expect(checklist(page)).toHaveCount(0);

  await page.goto("/account/password");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await page.getByRole("button", { name: "Show getting started again" }).click();
  // The button ends on Home, where the checklist is back as the person left it.
  await expect(page).toHaveURL(/\/$/);
  await expect(checklist(page)).toBeVisible();
  await expect(progress(page)).toContainText("0 of 4 done");
});

test("a new person walks through the checklist to 'You’re set up' and back", async ({
  page,
  request,
}) => {
  await signIn(page, E2E_USERS.starterFlow);
  await walkThrough(page, request);
});

test("Hide, 'I’ve installed one' and Show again work without JavaScript", async ({
  browser,
  baseURL,
  request,
}) => {
  // The token is made with JavaScript on (its dialog needs it); the person then reads Home without.
  const withScript = await browser.newContext({ baseURL });
  const first = await withScript.newPage();
  await signIn(first, E2E_USERS.starterNoJs);
  const token = await createToken(first, "no javascript");
  const state = await withScript.storageState();
  await withScript.close();
  await useToken(request, token);

  const context = await browser.newContext({
    baseURL,
    storageState: state,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(progress(page)).toContainText("2 of 4 done");
  // Hide, then bring it back from Account: both are plain forms.
  await page.getByRole("button", { name: "Hide Getting started" }).click();
  await expect(checklist(page)).toHaveCount(0);
  await page.goto("/account/password");
  await page.getByRole("button", { name: "Show getting started again" }).click();
  await expect(progress(page)).toContainText("2 of 4 done");
  await expect(checklist(page)).toContainText("Next: Install your first item");
  await checklist(page).getByRole("button", { name: "I’ve installed one" }).click();
  await expect(page.getByRole("heading", { name: "You’re set up" })).toBeVisible();
  // Seen once, without JavaScript too: the next visit has neither the steps nor "You’re set up".
  await page.goto("/");
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "You’re set up" })).toHaveCount(0);
  await context.close();
});
