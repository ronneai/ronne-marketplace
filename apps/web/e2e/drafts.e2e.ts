import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("a user drafts an agent in CodeMirror and the form, fixes its problem, saves and reloads; no one else sees it", async ({
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
  await user.getByRole("radio", { name: "@e2e-drafts" }).check();
  await user.getByLabel("Name").fill("Reviewer");
  await expect(user.getByText("@e2e-drafts/reviewer")).toBeVisible();
  // The type cards are labels around a hidden radio: click the card, as a person does.
  await user
    .locator("label")
    .filter({ has: user.locator('input[name="type"][value="agent"]') })
    .click();
  await expect(user.getByRole("radio", { name: /^agent/ })).toBeChecked();
  await user.getByRole("button", { name: "Create draft" }).click();
  await expect(user).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  const url = user.url();

  // The template's one problem: the empty description.
  const problems = user.getByRole("region", { name: "Problems" });
  await expect(problems.getByRole("listitem")).toHaveCount(1);
  await expect(problems.getByText(/description/)).toBeVisible();

  // The prompt, in CodeMirror.
  const files = user.getByRole("list", { name: "Files" });
  await files.getByRole("button", { name: /prompt\.md/ }).click();
  await user.getByLabel("Contents of prompt.md").click();
  await user.keyboard.press("ControlOrMeta+a");
  await user.keyboard.type("You review diffs for bugs.");
  await expect(user.getByText("Unsaved changes.")).toBeVisible();
  // Leaving with unsaved changes asks first, in the app's own dialog; staying keeps the edit.
  await user
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Submissions" })
    .click();
  const leave = user.getByRole("dialog", { name: "Leave without saving?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Stay on this page" }).click();
  await expect(leave).toBeHidden();
  await expect(user).toHaveURL(url);
  await expect(user.getByText("Unsaved changes.")).toBeVisible();

  // The description, in the form: the problem goes away.
  await files.getByRole("button", { name: /ronne\.yaml/ }).click();
  await user.getByRole("button", { name: "Form", exact: true }).click();
  await user.getByLabel("description").fill("Reviews diffs for bugs before a pull request.");
  await expect(problems.getByText("No problems found.")).toBeVisible();

  // The YAML follows the form, and keeps the template's comments.
  await user.getByRole("button", { name: "YAML", exact: true }).click();
  const yaml = user.getByLabel("Contents of ronne.yaml");
  // In place, so it keeps the placeholder's quotes.
  await expect(yaml).toContainText('description: "Reviews diffs for bugs before a pull request."');
  await expect(yaml).toContainText("# The file with the agent's system prompt.");

  await user.keyboard.press("ControlOrMeta+s");
  await expect(user.getByText(/Saved at/)).toBeVisible();

  await user.reload();
  await expect(problems.getByText("No problems found.")).toBeVisible();
  await expect(user.getByLabel("description")).toHaveValue(
    "Reviews diffs for bugs before a pull request.",
  );
  await files.getByRole("button", { name: /prompt\.md/ }).click();
  await expect(user.getByLabel("Contents of prompt.md")).toHaveText("You review diffs for bugs.");
  // An unsaved edit, then leaving on purpose.
  await files.getByRole("button", { name: /prompt\.md/ }).click();
  await user.getByLabel("Contents of prompt.md").press("End");
  await user.keyboard.type(" Unsaved.");
  await user
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Submissions" })
    .click();
  await user
    .getByRole("dialog", { name: "Leave without saving?" })
    .getByRole("button", { name: "Leave without saving" })
    .click();
  await expect(user).toHaveURL(/\/submissions$/);
  await expect(user.getByRole("link", { name: "@e2e-drafts/reviewer" })).toBeVisible();

  // Private: root gets a 404 for someone else's draft.
  expect((await root.goto(url))?.status()).toBe(404);
});
