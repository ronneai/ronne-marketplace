import { expect, type Page, test } from "@playwright/test";
import { toastWith } from "./toast";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 139: the notifications page. The seed wrote 30 notifications for one reader, five of them
 * read, and one in three about a submission that no longer exists (no link). The page pages them 25
 * at a time, filters by state and kind, marks the selected or all of them read, and the bell's badge
 * follows.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("the page lists, filters, pages and marks notifications read; the bell follows", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.notificationsReader);
  const bell = page.getByRole("banner").getByRole("button", { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName("Notifications, 25 unread");

  // The bell's panel leads here.
  await bell.click();
  await page
    .getByRole("dialog", { name: /^Notifications/ })
    .getByRole("link", { name: "See all notifications" })
    .click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();

  // 30 in all, 25 on the first page, newest first.
  await expect(page.getByText("30 notifications")).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(26);
  await expect(rows.nth(1)).toContainText("The system");
  const next = page.getByRole("link", { name: /next/i }).first();
  await next.click();
  await expect(page.getByRole("row")).toHaveCount(6);
  await page.goBack();

  // A row about something that is gone is text, one about a workspace is a link to it.
  await expect(page.getByRole("link", { name: /added you to global/ }).first()).toHaveAttribute(
    "href",
    "/workspaces/global",
  );
  await expect(page.getByText(/rejected @e2e-seeded\/gone-/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /rejected @e2e-seeded\/gone-/ })).toHaveCount(0);

  // Filter by state and by kind: kept in the address, shown as chips.
  await page.getByLabel("Status", { exact: true }).selectOption("read");
  await expect(page).toHaveURL(/state=read/);
  await expect(page.getByText("5 notifications")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("");
  await page.getByLabel("About", { exact: true }).selectOption("submission.rejected");
  await expect(page).toHaveURL(/kind=submission\.rejected/);
  await expect(page.getByText("10 notifications")).toBeVisible();
  await page.getByRole("link", { name: "Remove the about filter" }).click();
  await expect(page).not.toHaveURL(/kind=/);

  // Opening a notification marks it read: the newest role change leads to the workspace, and the
  // badge goes from 25 to 24; the page is read again on the way back.
  await page
    .getByRole("link", { name: /^The system changed your role in global/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/workspaces\/global$/);
  await expect(bell).toHaveAccessibleName("Notifications, 24 unread");
  await page.goBack();
  await expect(page.getByText("30 notifications")).toBeVisible();

  // Mark two selected ones read: the toast says so, the badge follows (24 unread → 22).
  await page
    .getByLabel(/^Select: The system added you to global/)
    .first()
    .check();
  await page
    .getByLabel(/^Select: The system changed your role/)
    .nth(1)
    .check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Mark selected as read" }).click();
  await expect(toastWith(page, "Marked 2 notifications as read.")).toBeVisible();
  await expect(bell).toHaveAccessibleName("Notifications, 22 unread");

  // Mark all: nothing is left unread.
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(toastWith(page, "Marked 22 notifications as read.")).toBeVisible();
  await expect(bell).toHaveAccessibleName("Notifications, none unread");
  await page.getByLabel("Status", { exact: true }).selectOption("unread");
  await expect(page.getByText("No notifications match these filters.")).toBeVisible();
});
