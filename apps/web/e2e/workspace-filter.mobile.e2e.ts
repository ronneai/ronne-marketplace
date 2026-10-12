import { expect, test } from "@playwright/test";
import { signIn } from "./mobile";
import { E2E_FOCUS, E2E_USERS } from "./users";

/**
 * Feature 120 on phones and tablets: the Menu's switcher sets the current workspace, which a
 * reload keeps and Reviews follows; Show all clears it.
 */
test("the Menu's switcher sets the current workspace, and Show all clears it", async ({
  page,
}, testInfo) => {
  const key = E2E_FOCUS.moderators[testInfo.project.name as keyof typeof E2E_FOCUS.moderators];
  await signIn(page, E2E_USERS[key]);
  await page.goto("/catalogue");
  const menu = page.getByRole("banner").getByRole("button", { name: /^Menu/ });
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await menu.click();
  await sheet.locator("summary").first().click();
  await sheet.getByRole("link").filter({ hasText: E2E_FOCUS.workspace }).first().click();
  await expect(page).toHaveURL(new RegExp(`/catalogue\\?workspace=${E2E_FOCUS.workspace}$`));
  await expect(page.getByText(`Showing ${E2E_FOCUS.workspace} only`)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(page.getByText(`Showing ${E2E_FOCUS.workspace} only`)).toBeVisible();
  // Reviews follows it: this workspace's waiting submission, not the other's.
  await page.goto("/reviews");
  await expect(page).toHaveURL(new RegExp(`/reviews\\?workspace=${E2E_FOCUS.workspace}$`));
  await expect(page.getByText(E2E_FOCUS.waiting)).toBeVisible();
  await expect(page.getByText(E2E_FOCUS.other.waiting)).toHaveCount(0);
  await page.goto("/catalogue");
  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(page.getByText(`Showing ${E2E_FOCUS.workspace} only`)).toHaveCount(0);
});
