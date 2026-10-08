import { expect, type Page } from "@playwright/test";
import { E2E_SCOPE, E2E_SKILL } from "./users";

/**
 * Issue #142, on every screen: a draft saved with a range nothing published matches shows Submit's
 * error in the problems badge after the save, and again when it's opened later. Edited, the error
 * stays, marked as of the last save; fixed and saved, it's gone. The signed-in page makes an agent
 * draft named `item`, whose only file to fill is ronne.yaml.
 */
export const saveAndSeeSubmitProblems = async (page: Page, item: string) => {
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

  const dependency = `@${E2E_SCOPE}/${E2E_SKILL}`;
  const manifest = (range: string) =>
    `name: "@${E2E_SCOPE}/${item}"\ntype: agent\ndescription: Shows what Submit would refuse.\nagent:\n  prompt: prompt.md\ndependencies:\n  "${dependency}": ${range}\n`;
  // The whole file at once, so the editor's indenting doesn't move the YAML around. Selected
  // without a shortcut: WebKit on Linux takes Ctrl+A as "start of line", as macOS does.
  const write = async (text: string) => {
    await page.getByRole("button", { name: "YAML", exact: true }).click();
    const editor = page.getByLabel("Contents of ronne.yaml");
    await editor.click();
    await editor.selectText();
    await page.keyboard.insertText(text);
    // Replaced, not added to: one manifest, the new range, and none of the template's text.
    await expect
      .poll(async () => ((await editor.textContent()) ?? "").split("type: agent").length - 1)
      .toBe(1);
    await expect(editor).not.toContainText('description: ""');
    await expect(editor).toContainText(text.trimEnd().split("\n").at(-1) ?? "");
  };
  const save = async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  };
  const problems = page.getByRole("button", { name: /^Problems: / });
  const unmatched = `No published version of ${dependency} matches ^9.0.0.`;

  // Before the save, the browser's own checks find nothing: the registry hasn't been asked.
  await write(manifest("^9.0.0"));
  await expect(problems).toHaveAccessibleName("Problems: No problems");
  await save();
  await expect(problems).toHaveAccessibleName("Problems: 1 error");
  await problems.click();
  await expect(page.getByText(unmatched)).toBeVisible();
  await page.keyboard.press("Escape");
  // Submit's dialog checks again, and refuses it in the same words.
  await page.getByRole("button", { name: "Submit for review" }).click();
  const submit = page.getByRole("dialog", { name: "Submit for review" });
  await expect(submit.getByText(unmatched)).toBeVisible();
  await expect(submit.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await submit.getByRole("button", { name: "Cancel" }).click();

  // Opened later, it says so before any save.
  await page.reload();
  await expect(problems).toHaveAccessibleName("Problems: 1 error");

  // Edited: still listed, as of the last save, until the next one checks again.
  await write(manifest("^1.0.0"));
  await expect(problems).toHaveAccessibleName("Problems: 1 error");
  await problems.click();
  await expect(page.getByText(/^As of your last save/)).toBeVisible();
  await expect(page.getByText(unmatched)).toBeVisible();
  await page.keyboard.press("Escape");
  await save();
  await expect(problems).toHaveAccessibleName("Problems: No problems");
};
