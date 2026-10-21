import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 124: Home on an instance that has released items. The sections come in their order,
 * the search box offers a link per type that has items, and the empty-instance message is gone
 * (a fresh instance is covered by the setup wizard test).
 */
test("Home shows search, the type links, then the lists, and not the empty message", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.homeMember);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);

  await expect(page.getByRole("heading", { level: 1, name: "Ronne AI Marketplace" })).toBeVisible();
  await expect(page.getByText("Find what’s reviewed and released")).toBeVisible();
  await expect(page.getByText("Nothing is published yet.")).toHaveCount(0);

  // The search box, then a link for each type that has items, then Recently published.
  const search = page.getByLabel("Search the catalogue");
  const types = page.getByRole("navigation", { name: "Browse by type" });
  const recent = page.getByRole("heading", { level: 2, name: "Recently published" });
  await expect(search).toBeVisible();
  await expect(types).toBeVisible();
  await expect(recent).toBeVisible();
  const [searchBox, typesBox, recentBox] = await Promise.all([
    search.boundingBox(),
    types.boundingBox(),
    recent.boundingBox(),
  ]);
  expect(searchBox?.y ?? 0).toBeLessThan(typesBox?.y ?? 0);
  expect(typesBox?.y ?? 0).toBeLessThan(recentBox?.y ?? 0);

  // A type with items opens the catalogue on it; one without has no link.
  await expect(types.getByRole("link", { name: "Skill" })).toHaveAttribute(
    "href",
    "/catalogue?type=skill",
  );
  await expect(types.locator('a[href*="type=bundle"]')).toHaveCount(0);
  await types.getByRole("link", { name: "Skill" }).click();
  await expect(page).toHaveURL(/\/catalogue\?type=skill/);

  // Searching goes to the catalogue with the words.
  await page.goto("/");
  await search.fill("zzz-no-such-item");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/catalogue\?q=zzz-no-such-item/);
});
