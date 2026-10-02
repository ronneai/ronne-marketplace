import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("a user writes a skill, submits it, sees it read-only, and withdraws it", async ({ page }) => {
  await signIn(page, E2E_USERS.submitter);
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill("secure-coding");
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="skill"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);

  // The skill template's two placeholders: the manifest's description and SKILL.md's.
  const problems = page.getByRole("button", { name: /^Problems: / });
  await expect(problems).toHaveAccessibleName("Problems: 2 errors");
  await page.getByLabel("description").fill("Checks code for common security mistakes.");
  const files = page.getByRole("list", { name: "Files" });
  await files.getByRole("button", { name: /SKILL\.md/ }).click();
  const skill = page.getByLabel("Contents of SKILL.md");
  await skill.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(
    "---\nname: secure-coding\ndescription: Checks code for common security mistakes.\n---\n\nCheck input, auth and secrets.\n",
  );
  await expect(problems).toHaveAccessibleName("Problems: No problems");

  // Submit waits for the changes to be saved, then shows the checks and submits.
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const submit = page.getByRole("dialog", { name: "Submit for review" });
  await expect(submit.getByText("All checks passed.")).toBeVisible();
  await submit.getByRole("button", { name: "Submit for review" }).click();

  // Read-only now: no Save or Settings, the editor can't be typed into, and Withdraw is offered.
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByLabel("description")).toBeDisabled();
  await files.getByRole("button", { name: /SKILL\.md/ }).click();
  await expect(page.getByLabel("Contents of SKILL.md")).toHaveAttribute("contenteditable", "false");

  await page.getByRole("button", { name: "Withdraw" }).click();
  const withdraw = page.getByRole("dialog", { name: /Withdraw/ });
  await expect(withdraw.getByRole("radio", { name: /Archive/ })).toBeChecked();
  await withdraw.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("It's out of review and doesn't hold its name.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);

  // Archived ones leave the default list (057), and the Archived filter shows them.
  await page.goto("/submissions");
  const name = new RegExp(`@${E2E_SCOPE}/secure-coding`);
  await expect(page.getByRole("row", { name })).toHaveCount(0);
  await page.getByRole("link", { name: /^archived \(/ }).click();
  await expect(page.getByRole("row", { name }).getByText("archived")).toBeVisible();
});
