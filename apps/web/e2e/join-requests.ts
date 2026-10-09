import { expect, type Page } from "@playwright/test";
import { E2E_JOIN } from "./users";

/**
 * Asking to join a workspace (094), shared by the desktop and the phone and tablet tests: the
 * asker asks from the Workspaces page, with a message, and sees the request.
 */
export const askToJoin = async (page: Page, message: string) => {
  await page.goto("/workspaces");
  const row = page.getByRole("row").filter({ hasText: E2E_JOIN });
  await row.getByRole("button", { name: `Ask to join ${E2E_JOIN}` }).click();
  const dialog = page.getByRole("dialog", { name: `Ask to join ${E2E_JOIN}` });
  await dialog.getByLabel("Message (optional)").fill(message);
  await dialog.getByRole("button", { name: "Ask to join" }).click();
  // The page refreshes: the row shows the request, and the dialog goes with the button.
  await expect(row).toContainText("Requested");
  await expect(dialog).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: `Cancel your request to join ${E2E_JOIN}` }),
  ).toBeVisible();
};

/** The moderator finds the request, with its message, on Requests and approves it. */
export const approveRequest = async (page: Page, asker: string, message: string) => {
  await page.goto("/workspaces/requests");
  const row = page.getByRole("row").filter({ hasText: asker });
  await expect(row).toContainText(E2E_JOIN);
  await expect(row).toContainText(message);
  await row.getByRole("button", { name: `Approve ${asker}` }).click();
  await expect(page.getByRole("row").filter({ hasText: asker })).toHaveCount(0);
};

/** Back on the Workspaces page, the asker is a user of the workspace. */
export const seeJoined = async (page: Page) => {
  await page.goto("/workspaces");
  const row = page.getByRole("row").filter({ hasText: E2E_JOIN });
  await expect(row).toContainText("User");
  await expect(row.getByRole("button", { name: `Ask to join ${E2E_JOIN}` })).toHaveCount(0);
};
