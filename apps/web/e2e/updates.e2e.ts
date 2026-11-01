import { expect, type Page, test } from "@playwright/test";
import { toastWith } from "./toast";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 140: root learns a newer version is out. The seed stored what a check that found 9.9.9
 * would have (the check itself needs GitHub: its tests use a fake answer) and told one root. This
 * root sees the notice, the sidebar's mark and Settings › Updates; a person who isn't root sees none
 * of them.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("root is told, sees the mark and the tab, and turns the check off and on", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.updatesRoot);

  // The notice: in the notifications, which every other root's feedback fills too, so it is found
  // by its kind. Opening it leads to the tab and reads it, and the bell's count drops by one.
  const bell = page.getByRole("banner").getByRole("button", { name: /^Notifications/ });
  const unread = async () => {
    const name = (await bell.getAttribute("aria-label")) ?? "";
    return Number(/(\d+) unread/.exec(name)?.[1] ?? 0);
  };
  const before = await unread();
  expect(before).toBeGreaterThanOrEqual(1);
  await page.goto("/notifications?kind=instance.update_available");
  await expect(page.getByText("1 notification", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: /Ronne AI Marketplace 9\.9\.9 is out\. You run version/ })
    .click();
  await expect(page).toHaveURL(/\/admin\/settings\?tab=updates$/);
  await expect.poll(unread).toBe(before - 1);

  // The sidebar's mark leads here as well.
  const mark = page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", {
    name: "Update available",
  });
  await expect(mark).toHaveAttribute("href", "/admin/settings?tab=updates");

  // The tab: both versions, the notes, a newer one, and how to update: a clone is this server's way, the others are folded.
  await expect(page.getByRole("heading", { name: "Updates", level: 2 })).toBeVisible();
  await expect(page.getByText("Version 9.9.9 is out.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Release notes" })).toHaveAttribute(
    "href",
    "https://github.com/ronneai/ronne-marketplace/releases/tag/v9.9.9",
  );
  const how = page.getByRole("region", { name: "How to update" });
  const open = how.locator("details[open]");
  await expect(open).toHaveCount(1);
  await expect(open.getByText("pnpm run backup")).toBeVisible();
  await expect(open.getByText("git pull")).toBeVisible();
  await expect(how.getByText("This instance")).toBeVisible();
  // Every other way to install is there too, folded until it is opened.
  await expect(how.getByText("docker compose pull")).toBeHidden();
  await how.getByText("Docker", { exact: true }).click();
  await expect(how.getByText("docker compose pull")).toBeVisible();
  await how.getByText(".deb or .rpm package (apt, dnf)").click();
  await expect(how.getByText("sudo apt install ./rmk-server_*.deb")).toBeVisible();

  // The switch: off greys Check now out, is said as a toast, and reaches the audit log.
  const enabled = page.getByRole("checkbox", { name: "Check for updates" });
  const checkNow = page.getByRole("button", { name: "Check now" });
  await expect(enabled).toBeChecked();
  await expect(checkNow).toBeEnabled();
  await enabled.uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(toastWith(page, "Saved.")).toBeVisible();
  await expect(checkNow).toBeDisabled();
  await expect(page.getByText("from before the check was turned off")).toBeVisible();

  await page.goto("/admin/audit");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "settings.update_check" })
      .filter({ hasText: "Changed the check for updates: turned off" }),
  ).toHaveCount(1);

  // And back on, so the instance is as it was.
  await page.goto("/admin/settings?tab=updates");
  await page.getByRole("checkbox", { name: "Check for updates" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(toastWith(page, "Saved.")).toBeVisible();
  await expect(checkNow).toBeEnabled();
});

test("someone who isn't root sees no mark and no tab", async ({ page }) => {
  await signIn(page, E2E_USERS.notificationsReader);
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Update available" })).toHaveCount(0);
  const response = await page.goto("/admin/settings?tab=updates");
  expect(response?.status()).toBe(404);
});
