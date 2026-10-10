import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_TWIN, E2E_TWIN_OLD_NAME, E2E_USERS } from "./users";

/**
 * A dependency named by an old name (118): the save warns, and Use the new name rewrites it in
 * ronne.yaml, keeping its range, so the next save has nothing to say.
 */
test("Use the new name rewrites a dependency named by its old name (118)", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.problemsAuthor);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  const item = "uses-new-name";
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(item);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="agent"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);

  const newName = `@${E2E_TWIN.workspace}/${E2E_TWIN.scope}/${E2E_TWIN.item}`;
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  const editor = page.getByLabel("Contents of ronne.yaml");
  await editor.click();
  await editor.selectText();
  await page.keyboard.insertText(
    `name: "@${E2E_SCOPE}/${item}"\ntype: agent\ndescription: Depends on a renamed skill.\nagent:\n  prompt: prompt.md\ndependencies:\n  "${E2E_TWIN_OLD_NAME}": ^1.0.0\n`,
  );
  await expect(editor).toContainText(E2E_TWIN_OLD_NAME);
  const save = async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  };
  await save();

  const problems = page.getByRole("button", { name: /^Problems: / });
  await expect(problems).toHaveAccessibleName("Problems: 1 warning");
  await problems.click();
  await expect(page.getByText(`${E2E_TWIN_OLD_NAME} is now ${newName}.`)).toBeVisible();
  await page.getByRole("button", { name: "Use the new name" }).click();

  // Rewritten in place, range kept; unsaved until Save.
  await expect(editor).toContainText(`"${newName}": ^1.0.0`);
  await expect(editor).not.toContainText(E2E_TWIN_OLD_NAME);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await save();
  await expect(problems).toHaveAccessibleName("Problems: No problems");
});
