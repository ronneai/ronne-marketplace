import { type APIRequestContext, expect, type Page } from "@playwright/test";

/** Home's Getting started checklist (126). */
export const checklist = (page: Page) => page.getByRole("region", { name: "Getting started" });

/** A step's list item, by its title. */
export const step = (page: Page, title: string) =>
  checklist(page).getByRole("listitem").filter({ hasText: title });

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
 * "You're set up"; the next visit has no checklist; Account brings it back as "You're set up".
 * It changes the person's state for good, so each attempt needs a fresh user: after a failed first
 * attempt a retry stops at "0 of 4", and the first attempt's trace is the one to read.
 */
export const walkThrough = async (page: Page, request: APIRequestContext) => {
  await page.goto("/");
  await expect(checklist(page)).toBeVisible();
  await expect(checklist(page).getByText("0 of 4 done")).toBeVisible();
  await expect(step(page, "Create an access token")).toHaveAttribute("aria-current", "step");
  // The sign-in lines carry this instance's own address, and no token is on the page.
  const origin = new URL(page.url()).origin;
  await expect(checklist(page).getByText(`rmk login --registry ${origin} --web`)).toBeVisible();

  const token = await createToken(page, "getting started");
  await page.goto("/");
  await expect(checklist(page).getByText("1 of 4 done")).toBeVisible();
  await expect(
    step(page, "Create an access token").getByText("Done", { exact: true }),
  ).toBeVisible();
  await expect(step(page, "Connect rmk")).toHaveAttribute("aria-current", "step");
  await expect(page.locator("main")).not.toContainText(token);
  // The npm line is for people with no token yet.
  await expect(checklist(page).getByText("npm install --global @ronneai/rmk")).toHaveCount(0);

  await useToken(request, token);
  await page.goto("/");
  await expect(checklist(page).getByText("2 of 4 done")).toBeVisible();
  await expect(step(page, "Connect rmk").getByText("Done", { exact: true })).toBeVisible();
  await expect(step(page, "Install your first item")).toHaveAttribute("aria-current", "step");

  await page.getByRole("button", { name: "I’ve installed one" }).click();
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
