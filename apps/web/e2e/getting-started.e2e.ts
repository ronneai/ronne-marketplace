import { expect, test } from "@playwright/test";
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

const checklist = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Getting started" });

test("a hidden checklist comes back from Account, on Home", async ({ page }) => {
  await signIn(page, E2E_USERS.starterAccount);
  await expect(checklist(page)).toBeVisible();
  await expect(checklist(page).getByText("0 of 4 done")).toBeVisible();

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
  await expect(checklist(page).getByText("0 of 4 done")).toBeVisible();
});
