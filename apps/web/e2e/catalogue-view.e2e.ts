import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * The Catalogue as a grid of compact cards or a list of full ones (feature 126, owner,
 * 2026-10-21): two links, so the choice is in the address, survives searching, sorting and paging,
 * and works without JavaScript.
 */
const cardLefts = (page: import("@playwright/test").Page) =>
  page
    .locator("main article")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));

test("the Catalogue switches between a grid and a list, and keeps the choice", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.catalogueView);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);

  // The grid by default: compact cards, several to a row, no command box.
  await page.goto("/catalogue");
  const cards = page.locator("main article");
  await expect(cards.first()).toBeVisible();
  expect(new Set(await cardLefts(page)).size).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("link", { name: "Grid view" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(cards.first().locator("code")).toHaveCount(0);

  // The list: full cards, one to a row, with the command, the tools and the place line.
  await page.getByRole("link", { name: "List view" }).click();
  await expect(page).toHaveURL(/\/catalogue\?view=list$/);
  await expect(page.getByRole("link", { name: "List view" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(new Set(await cardLefts(page)).size).toBe(1);
  await expect(cards.first().locator("code")).toHaveCount(1);
  await expect(cards.first()).toContainText("works in ");
  await expect(cards.first().getByText("Workspace", { exact: true })).toBeVisible();

  // The choice rides along a search and a sort.
  await page.getByLabel("Search", { exact: true }).fill("e");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.locator("summary", { hasText: "Sort:" }).click();
  await page.getByRole("link", { name: /^Name/ }).click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/view=list/);

  // And back to the grid, which leaves the parameter out.
  await page.getByRole("link", { name: "Grid view" }).click();
  await expect(page).not.toHaveURL(/view=/);
  expect(new Set(await cardLefts(page)).size).toBeGreaterThanOrEqual(3);
});

test("the switch works without JavaScript: it is two links", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.catalogueViewNoJs);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/catalogue");
  await page.getByRole("link", { name: "List view" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.locator("main article").first().locator("code")).toHaveCount(1);
  await context.close();
});
