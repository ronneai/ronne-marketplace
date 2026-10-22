import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";

/** Home's Getting started banner (126). */
export const checklist = (page: Page) => page.getByRole("region", { name: "Getting started" });

/** The banner's title line, which carries the count: "Getting started · 2 of 4 done". */
export const progress = (page: Page) =>
  checklist(page).getByRole("heading", { level: 2, name: /^Getting started/ });

/** The steps dialog, opened with the button named `opener`; give it back to read and to close. */
export const openSteps = async (page: Page, opener: string): Promise<Locator> => {
  await checklist(page).getByRole("button", { name: opener }).click();
  const dialog = page.getByRole("dialog", { name: "Getting started" });
  await expect(dialog).toBeVisible();
  return dialog;
};

/** A step's list item in the open dialog, by its title. */
export const step = (dialog: Locator, title: string) =>
  dialog.getByRole("listitem").filter({ hasText: title });

export const closeSteps = async (dialog: Locator) => {
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
};

/** Makes a token through the Create token dialog and gives its value, which is shown once. */
export const createToken = async (page: Page, name: string): Promise<string> => {
  await page.goto("/account/tokens");
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Copy it now")).toBeVisible();
  const token = (await dialog.locator("code").first().innerText()).trim();
  expect(token).toMatch(/^rmk_[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  return token;
};

/** What `rmk` does first: asks the API who the token is. A bearer token only, no cookies. */
export const useToken = async (request: APIRequestContext, token: string) => {
  const me = await request.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(200);
};

/**
 * The whole walk-through for a person who is signed in and has done nothing: 0 of 4; a token (1);
 * rmk used (2, and the sign-in lines are the instance's own); "I've installed one" ends on
 * "You're set up"; the next visit has no banner; Account brings it back as "You're set up".
 * It changes the person's state for good, so each attempt needs a fresh user: after a failed first
 * attempt a retry stops at "0 of 4", and the first attempt's trace is the one to read.
 */
export const walkThrough = async (page: Page, request: APIRequestContext) => {
  await page.goto("/");
  await expect(checklist(page)).toBeVisible();
  await expect(progress(page)).toContainText("0 of 4 done");
  await expect(checklist(page)).toContainText("Next: Create an access token");
  // The commands are not on the page itself, only in the steps dialog, with this instance's address.
  await expect(page.locator("main code:visible", { hasText: "rmk login" })).toHaveCount(0);
  const origin = new URL(page.url()).origin;
  let steps = await openSteps(page, "See all steps");
  await expect(steps.getByText(`rmk login --registry ${origin} --web`)).toBeVisible();
  await expect(step(steps, "Create an access token")).toHaveAttribute("aria-current", "step");
  await closeSteps(steps);

  const token = await createToken(page, "getting started");
  await page.goto("/");
  await expect(progress(page)).toContainText("1 of 4 done");
  await expect(checklist(page)).toContainText("Next: Connect rmk");
  await expect(page.locator("main")).not.toContainText(token);
  steps = await openSteps(page, "Show the commands");
  await expect(
    step(steps, "Create an access token").getByText("Done", { exact: true }),
  ).toBeAttached();
  await expect(step(steps, "Connect rmk")).toHaveAttribute("aria-current", "step");
  // The npm line is for people with no token yet.
  await expect(steps.getByText("npm install --global @ronneai/rmk")).toHaveCount(0);
  await expect(steps).not.toContainText(token);
  await closeSteps(steps);

  await useToken(request, token);
  await page.goto("/");
  await expect(progress(page)).toContainText("2 of 4 done");
  await expect(checklist(page)).toContainText("Next: Install your first item");
  steps = await openSteps(page, "See all steps");
  await expect(step(steps, "Connect rmk").getByText("Done", { exact: true })).toBeAttached();
  await closeSteps(steps);

  await checklist(page).getByRole("button", { name: "I’ve installed one" }).click();
  await expect(page.getByRole("region", { name: "You’re set up" })).toBeVisible();

  // Seen once: the next visit has nothing.
  await page.goto("/");
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "You’re set up" })).toHaveCount(0);

  // Account brings it back, as "You're set up".
  await page.goto("/account/password");
  await page.getByRole("button", { name: "Show getting started again" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "You’re set up" })).toBeVisible();
};
