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
  const problems = page.getByRole("region", { name: "Problems" });
  await expect(problems.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("description").fill("Checks code for common security mistakes.");
  const files = page.getByRole("list", { name: "Files" });
  await files.getByRole("button", { name: /SKILL\.md/ }).click();
  const skill = page.getByLabel("Contents of SKILL.md");
  await skill.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(
    "---\nname: secure-coding\ndescription: Checks code for common security mistakes.\n---\n\nCheck input, auth and secrets.\n",
  );
  await expect(problems.getByText("No problems found.")).toBeVisible();

  // Submitting asks to save first, then shows the checks and submits.
  await page.getByRole("button", { name: "Submit for review" }).click();
  const submit = page.getByRole("dialog", { name: "Submit for review" });
  await expect(submit.getByText("Save your changes first")).toBeVisible();
  await submit.getByRole("button", { name: "Close" }).first().click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
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
  await expect(withdraw.getByText("It can't be undone.")).toBeVisible();
  await withdraw.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("It stays here, read-only, for history.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);

  await page.goto("/submissions");
  const row = page.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/secure-coding`) });
  await expect(row.getByText("withdrawn")).toBeVisible();
});
