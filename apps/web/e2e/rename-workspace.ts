import { expect, type Page } from "@playwright/test";
import { E2E_RENAME } from "./users";

/**
 * Feature 113, on every screen: the workspace's admin renames it from its page, lands on the new
 * address, and the old one answers not found. Its item has the new name, and its old item address
 * still leads to it (an alias, 118). The signed-in page is the project's admin.
 */
export const renameAsAdmin = async (page: Page, project: string) => {
  const from = E2E_RENAME.workspace(project);
  const to = E2E_RENAME.renamed(project);
  await page.goto(`/admin/workspaces/${from}`);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rename workspace" });
  await expect(dialog.getByText("Its 1 item will be renamed from")).toBeVisible();
  const field = dialog.getByLabel("New name");
  await expect(field).toHaveValue(from);
  // The phone sweep's checks (065, 067): with the field focused, the title and buttons stay in
  // view, and nothing scrolls sideways.
  await field.focus();
  await expect(dialog.getByRole("heading", { name: "Rename workspace" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    "the dialog doesn't scroll sideways",
  ).toBe(true);
  await field.fill(to);
  await expect(dialog.getByText(`@${to}/…`)).toBeVisible();
  const save = dialog.getByRole("button", { name: "Rename", exact: true });
  await expect(save).toBeInViewport();
  await save.click();

  await expect(page).toHaveURL(new RegExp(`/admin/workspaces/${to}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(to);
  // The old address is a name no workspace has.
  expect((await page.goto(`/admin/workspaces/${from}`))?.status()).toBe(404);

  // Its item takes the new name; the old item address leads to it.
  const item = `${E2E_RENAME.scope}/${E2E_RENAME.item}`;
  await page.goto(`/workspaces/${from}/items/${item}`);
  await expect(page).toHaveURL(new RegExp(`/workspaces/${to}/items/${item}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`@${to}/${item}`);
};
