import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("a user drafts an agent, edits its prompt in CodeMirror, saves and reloads; no one else sees it", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root);
  await root.goto("/admin/scopes");
  await root.getByRole("button", { name: "Create scope" }).click();
  const dialog = root.getByRole("dialog");
  await dialog.getByLabel("Name").fill("e2e-drafts");
  await dialog.getByLabel("Description").fill("Drafts from the end-to-end tests.");
  await dialog.getByRole("button", { name: "Create scope" }).click();
  await expect(dialog.getByText("Created @e2e-drafts.")).toBeVisible();

  const user = await browser.newPage();
  await signIn(user, E2E_USERS.notRoot);
  await user
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Submissions" })
    .click();
  await expect(user.getByText("You have no drafts yet.")).toBeVisible();
  await user.getByRole("link", { name: "New item" }).click();
  await user.getByText("@e2e-drafts", { exact: true }).click();
  await user.getByLabel("Name").fill("Reviewer");
  await expect(user.getByText("@e2e-drafts/reviewer")).toBeVisible();
  await user.getByText("agent", { exact: true }).click();
  await user.getByRole("button", { name: "Create draft" }).click();
  await expect(user).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  const url = user.url();

  await user
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /prompt\.md/ })
    .click();
  const prompt = user.getByLabel("Contents of prompt.md");
  await prompt.click();
  await user.keyboard.press("ControlOrMeta+a");
  await user.keyboard.type("You review diffs for bugs.");
  await expect(user.getByText("Unsaved changes.")).toBeVisible();
  await user.keyboard.press("ControlOrMeta+s");
  await expect(user.getByText(/Saved at/)).toBeVisible();

  await user.reload();
  await user
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /prompt\.md/ })
    .click();
  await expect(user.getByLabel("Contents of prompt.md")).toHaveText("You review diffs for bugs.");
  await user.goto("/submissions");
  await expect(user.getByRole("link", { name: "@e2e-drafts/reviewer" })).toBeVisible();

  // Private: root gets a 404 for someone else's draft.
  expect((await root.goto(url))?.status()).toBe(404);
});
