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

  // Filter by status and by kind with the multi-select popovers (137): what is chosen shows as
  // badges on the button, and is kept in the address.
  const status = page.getByRole("button", { name: "Status", exact: true });
  const about = page.getByRole("button", { name: "About", exact: true });
  await expect(status).toContainText("All");
  await status.click();
  await page.getByRole("dialog", { name: "Status" }).getByLabel("Read", { exact: true }).check();
  await expect(page).toHaveURL(/state=read/);
  await expect(page.getByText("5 notifications")).toBeVisible();
  await expect(status).toContainText("Read");
  await page.getByRole("dialog", { name: "Status" }).getByLabel("All", { exact: true }).check();
  await expect(page).not.toHaveURL(/state=/);
  await page.keyboard.press("Escape");

  // Two kinds at once: any of them (10 each), shown beside the button.
  await about.click();
  const kinds = page.getByRole("dialog", { name: "About" });
  await kinds.getByLabel("Added to a workspace", { exact: true }).check();
  await kinds.getByLabel("Role changed", { exact: true }).check();
  await expect(page).toHaveURL(/kind=membership\.added%2Cmembership\.role_changed/);
  await expect(page.getByText("20 notifications")).toBeVisible();
  await expect(about).toContainText("Added to a workspace");
  await expect(about).toContainText("Role changed");
  // A third makes the button say "+1 more"; unticking them all leaves "All".
  await kinds.getByLabel("Rejected", { exact: true }).check();
  await expect(about).toContainText("+1 more");
  await expect(page.getByText("30 notifications")).toBeVisible();
  await kinds.getByLabel("Added to a workspace", { exact: true }).uncheck();
  await kinds.getByLabel("Role changed", { exact: true }).uncheck();
  await expect(page).toHaveURL(/kind=submission\.rejected$/);
  await expect(page.getByText("10 notifications")).toBeVisible();
  await kinds.getByLabel("Rejected", { exact: true }).uncheck();
  await expect(page).not.toHaveURL(/kind=/);
  await expect(about).toContainText("All");
  await page.keyboard.press("Escape");

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
  await status.click();
  await page.getByRole("dialog", { name: "Status" }).getByLabel("Unread", { exact: true }).check();
  await expect(page.getByText("No notifications match these filters.")).toBeVisible();
});
