import { expect, type Page } from "@playwright/test";
import { E2E_PERSONAL } from "./users";

/**
 * Feature 114, on every screen: the owner opens their personal workspace from the Workspaces page,
 * creates a scope there, drafts a rule in it, submits it (approved at once: nobody reviews it),
 * releases it and sees the item. Another user gets not found for the item and the workspace. The
 * signed-in pages are the owner's and the outsider's.
 */
export const releaseInPersonal = async (owner: Page, outsider: Page, workspace: string) => {
  const { scope, item } = E2E_PERSONAL;
  const full = `@${workspace}/${scope}/${item}`;

  // Listed first, as Personal and Yours, with Manage.
  await owner.goto("/workspaces");
  const row = owner.getByRole("row").nth(1);
  await expect(row).toContainText(workspace);
  await expect(row).toContainText("Personal");
  await row.getByRole("link", { name: `Manage ${workspace}` }).click();
  await expect(owner).toHaveURL(new RegExp(`/workspaces/${workspace}$`));
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText(workspace);
  // Its scopes only: no members, no requests, no visibility, no Delete.
  await expect(owner.getByRole("link", { name: "Members" })).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Make public" })).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await owner.getByRole("button", { name: "Create scope" }).click();
  const create = owner.getByRole("dialog", { name: "Create scope" });
  await create.getByLabel("Name").fill(scope);
  await create.getByLabel("Description").fill("My own tools.");
  await create.getByRole("button", { name: "Create scope" }).click();
  await expect(create.getByText(`Created @${scope} in ${workspace}.`)).toBeVisible();
  await create.getByRole("button", { name: "Done" }).click();

  // The editor offers it first, under Personal.
  await owner.goto("/submissions/new");
  await expect(owner.getByText(`Personal (${workspace})`)).toBeVisible();
  await owner
    .locator("label")
    .filter({ has: owner.locator(`input[name="scope"][value="${workspace}/${scope}"]`) })
    .click();
  await owner.getByLabel("Name").fill(item);
  await owner
    .locator("label")
    .filter({ has: owner.locator('input[name="type"][value="rule"]') })
    .click();
  await owner.getByRole("button", { name: "Create draft" }).click();
  await expect(owner).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  const submission = owner.url();

  // The whole manifest at once, with its description. Selected without a shortcut: WebKit on
  // Linux takes Ctrl+A as "start of line".
  await owner.getByRole("button", { name: "YAML", exact: true }).click();
  const editor = owner.getByLabel("Contents of ronne.yaml");
  await editor.click();
  await editor.selectText();
  await owner.keyboard.insertText(
    `name: "${full}"\ntype: rule\ndescription: Notes for one.\nrule:\n  body: rule.md\n  activation: always\n`,
  );
  await expect(editor).toContainText("Notes for one.");
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  // Submit, not "for review": it's approved as it's sent.
  await owner.getByRole("button", { name: "Submit", exact: true }).click();
  const submit = owner.getByRole("dialog", { name: "Submit" });
  await expect(submit.getByText("personal workspaces aren't reviewed")).toBeVisible();
  await submit.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    owner.getByText("Approved by you: personal workspaces aren't reviewed."),
  ).toBeVisible();

  await owner.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = owner.getByRole("dialog", { name: new RegExp(`Publish ${full}`) });
  await publish.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(publish.getByText(`Published ${full} 1.0.0 as latest.`)).toBeVisible();
  await publish.getByRole("button", { name: "Done" }).click();
  // The page refreshes to its released state before going on.
  await expect(publish).toBeHidden();
  await expect(owner.getByText("A released version never changes")).toBeVisible();

  // The owner sees the item, released without review.
  const itemPath = `/workspaces/${workspace}/items/${scope}/${item}`;
  await owner.goto(itemPath);
  await expect(owner.getByRole("heading", { level: 1 })).toContainText(full);
  await expect(owner.getByText("Released without review.")).toBeVisible();

  // Anyone else: as if neither existed.
  for (const path of [itemPath, submission, `/workspaces/${workspace}`])
    expect((await outsider.goto(path))?.status(), path).toBe(404);
};
