import { expect, test } from "@playwright/test";
import { headerName, sidebar } from "./helpers";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 119: from `lg` the navigation is a sidebar. It folds into a rail of named icons, and stays
 * folded across a reload; the workspace switcher opens a workspace's page.
 */
test("the sidebar folds and stays folded; the switcher opens a workspace", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.sidebar);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES.sidebar)).toBeVisible();

  const aside = sidebar(page);
  const nav = aside.getByRole("navigation", { name: "Main" });
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(aside.getByText("Discover", { exact: true })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Propose item" })).toHaveAttribute(
    "href",
    "/submissions/new",
  );

  // Fold: the rail names every icon, and the next page renders folded.
  await aside.getByRole("button", { name: "Fold the sidebar" }).click();
  const unfold = aside.getByRole("button", { name: "Unfold the sidebar" });
  await expect(unfold).toHaveAttribute("aria-expanded", "false");
  await expect(aside.getByText("Discover", { exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Catalogue", exact: true })).toBeVisible();
  expect((await aside.boundingBox())?.width ?? 0).toBeLessThanOrEqual(65);
  await page.reload();
  await expect(unfold).toBeVisible();
  await nav.getByRole("link", { name: "Catalogue", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(unfold).toBeVisible();
  await unfold.click();
  await expect(aside.getByRole("button", { name: "Fold the sidebar" })).toBeVisible();

  // The switcher (120): All workspaces at first; choosing their personal workspace makes it the
  // current one and stays on the page; each row also opens its workspace's page.
  const switcher = aside.locator("details").first();
  const summary = switcher.locator("summary");
  await expect(summary).toContainText("All workspaces");
  await summary.click();
  const personal = switcher.getByRole("link").filter({ hasText: "personal" });
  await personal.click();
  await expect(page).toHaveURL(/\/catalogue(\?|$)/);
  await expect(summary).toContainText("Personal workspace");
  const name = (await summary.locator("span span").first().textContent()) ?? "";
  await summary.click();
  await expect(personal).toHaveAttribute("aria-current", "true");
  await switcher.getByRole("link", { name: `Open ${name}'s page` }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${name}$`));
  await expect(nav.getByRole("link", { name: "Workspaces", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // All workspaces again, then Manage workspaces opens the list.
  await summary.click();
  await switcher.getByRole("link", { name: "All workspaces" }).click();
  await expect(summary).toContainText("All workspaces");
  await summary.click();
  await switcher.getByRole("link", { name: "Manage workspaces" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
});
