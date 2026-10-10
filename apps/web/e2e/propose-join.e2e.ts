import { expect, test } from "@playwright/test";
import { signIn } from "./mobile";
import { E2E_DOOR, E2E_USERS } from "./users";

/**
 * Someone not in an item's workspace clicks Propose a change (091): the refusal says why and links
 * to Ask to join the workspace (094), which opens its join page with the form.
 */
test("Propose a change outside your workspaces links to Ask to join it (094)", async ({ page }) => {
  await signIn(page, E2E_USERS.proposeOutsider);
  await page.goto(`/workspaces/${E2E_DOOR.workspace}/items/${E2E_DOOR.scope}/${E2E_DOOR.item}`);
  await page.getByRole("button", { name: "Propose a change", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: `You aren't a member of the ${E2E_DOOR.workspace}` }),
  ).toBeVisible();
  await page.getByRole("link", { name: `Ask to join ${E2E_DOOR.workspace}` }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${E2E_DOOR.workspace}/join$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Join ${E2E_DOOR.workspace}`);
  await expect(page.getByLabel("Message (optional)")).toBeVisible();
});
