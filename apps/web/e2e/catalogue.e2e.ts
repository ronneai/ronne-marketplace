import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_SKILL, E2E_USERS } from "./users";

test("a user searches from the home page, filters by type, reads a skill's README and copies the install command", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.browser);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  // The home page lists what's new, and its search box leads into the catalogue.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recently published" })).toBeVisible();
  await page.getByLabel("Search the catalogue").fill("security");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue\?q=security/);
  await page
    .getByRole("navigation", { name: "Types" })
    .getByRole("link", { name: /^skill/ })
    .click();
  await expect(page).toHaveURL(/type=skill/);

  const name = `@${E2E_SCOPE}/${E2E_SKILL}`;
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Secret scanner" })).toBeVisible();
  await expect(page.getByText("license MIT · #security · #owasp")).toBeVisible();

  const install = page
    .locator("section, div")
    .filter({ hasText: /^Install/ })
    .first();
  await install.getByRole("button", { name: "copy" }).first().click();
  await expect(install.getByText("copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`rmk install ${name}`);

  // The other tabs are links of their own.
  await page.getByRole("navigation", { name: "Item" }).getByRole("link", { name: "Files" }).click();
  await expect(page.getByRole("cell", { name: "SKILL.md" })).toBeVisible();
});
