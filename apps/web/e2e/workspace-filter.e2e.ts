import { expect, type Page, test } from "@playwright/test";
import { sidebar } from "./helpers";
import { signIn } from "./mobile";
import { E2E_FOCUS, E2E_USERS, E2E_VAULT } from "./users";

/**
 * Feature 120: the switcher sets a current workspace that the Catalogue, Reviews and My
 * submissions show, the URL saying it; Show all clears it; a link shows what it says; a private
 * workspace in the URL looks like one that doesn't exist; and it all works without JavaScript.
 */
const { workspace, item, other } = E2E_FOCUS;
const draft = `${E2E_FOCUS.draft}-chromium`;
const otherDraft = `${other.draft}-chromium`;
const email = E2E_USERS[E2E_FOCUS.moderators.chromium];

const showing = (page: Page) => page.getByText(`Showing ${workspace} only`);
const switcher = (page: Page) => sidebar(page).locator("details").first();

const choose = async (page: Page, name: string) => {
  await switcher(page).locator("summary").click();
  await switcher(page).getByRole("link").filter({ hasText: name }).first().click();
};

test("a current workspace narrows the catalogue, reviews and my submissions until Show all", async ({
  page,
}) => {
  await signIn(page, email);
  // Before choosing: both workspaces' submissions, in Reviews and in My submissions.
  await page.goto("/reviews");
  await expect(page.getByText(E2E_FOCUS.waiting).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(other.waiting).filter({ visible: true }).first()).toBeVisible();
  await page.goto("/submissions");
  await expect(page.getByText(draft).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(otherDraft).filter({ visible: true }).first()).toBeVisible();
  // The other workspace's item is in the catalogue, found by name (it's seeded as old, so it may
  // not be on the first page).
  await page.goto(`/catalogue?q=${other.item}`);
  await expect(page.getByRole("article").filter({ hasText: other.item })).toHaveCount(1);
  await page.goto("/catalogue");
  await expect(switcher(page).locator("summary")).toContainText("All workspaces");

  // Choose it: the catalogue shows only its item, and the URL says so.
  await choose(page, workspace);
  await expect(page).toHaveURL(new RegExp(`/catalogue\\?workspace=${workspace}$`));
  await expect(showing(page)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(item);
  await expect(switcher(page).locator("summary")).toContainText(workspace);

  // It stays: a reload, and the sidebar's plain links, which redirect to it.
  await page.reload();
  await expect(showing(page)).toBeVisible();
  const nav = sidebar(page).getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: /^Reviews/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reviews\\?workspace=${workspace}$`));
  await expect(showing(page)).toBeVisible();
  // Only this workspace's submission waits here; the other's drops out.
  await expect(page.getByText(E2E_FOCUS.waiting).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(other.waiting)).toHaveCount(0);
  await page.getByRole("link", { name: "Waiting on the author" }).click();
  await expect(page).toHaveURL(new RegExp(`workspace=${workspace}`));
  await nav.getByRole("link", { name: "Submissions", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/submissions\\?workspace=${workspace}$`));
  await expect(showing(page)).toBeVisible();
  await expect(page.getByText(draft).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(otherDraft)).toHaveCount(0);
  // Nothing else is filtered.
  await nav.getByRole("link", { name: "Workspaces", exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(showing(page)).toHaveCount(0);

  // Show all clears it, here and from then on.
  await nav.getByRole("link", { name: "Catalogue", exact: true }).click();
  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(showing(page)).toHaveCount(0);
  await expect(switcher(page).locator("summary")).toContainText("All workspaces");
  await page.goto("/reviews");
  await expect(page).toHaveURL(/\/reviews$/);
});

test("a link shows what it names; a private workspace looks like one that doesn't exist", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.notRoot);
  // Someone else's link to a public workspace they aren't in: its items, and their own choice
  // doesn't change.
  await page.goto(`/catalogue?workspace=${workspace}`);
  await expect(showing(page)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(item);
  await expect(switcher(page).locator("summary")).toContainText("All workspaces");
  // A private workspace they aren't in, and a name no workspace has: the same words, nothing shown.
  for (const name of [E2E_VAULT.workspace, "e2e-no-such-workspace"]) {
    await page.goto(`/catalogue?workspace=${name}`);
    await expect(page.getByText(`No workspace ${name} you can see`)).toBeVisible();
    await expect(page.getByText(E2E_VAULT.item)).toHaveCount(0);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the switcher and Show all still set and clear it", async ({ page }) => {
    await signIn(page, email);
    await page.goto("/catalogue");
    await choose(page, workspace);
    await expect(page).toHaveURL(new RegExp(`/catalogue\\?workspace=${workspace}$`));
    await expect(showing(page)).toBeVisible();
    await page.getByRole("link", { name: "Show all" }).click();
    await expect(page).toHaveURL(/\/catalogue$/);
    await expect(showing(page)).toHaveCount(0);
  });
});
