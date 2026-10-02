import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Withdrawing asks to archive or delete (feature 057): an archived submission is out of the list
 * and private, and comes back as a draft; one nobody reviewed can be deleted for good.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

/** A rule draft with its description written, so it passes the checks. Returns its page's URL. */
const ruleDraft = async (page: Page, name: string) => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(name);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="rule"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  await page.getByLabel("description").fill("House style for the end-to-end tests.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  return page.url();
};

const submit = async (page: Page, button: "Submit for review" | "Resubmit for review") => {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", { name: button });
  await expect(dialog.getByText("All checks passed.")).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
};

test("an author archives a submission, finds it under Archived, restores it and submits it again", async ({
  browser,
}) => {
  const author = await browser.newPage();
  await signIn(author, E2E_USERS.archiver);
  const url = await ruleDraft(author, "archive-me");
  await submit(author, "Submit for review");

  // A reviewer took part, so only archiving is offered.
  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.archiveModerator);
  await moderator.goto(url.replace("/submissions/", "/reviews/"));
  await moderator.getByLabel("Comment").fill("Why a rule rather than a skill?");
  await moderator.getByRole("button", { name: "Comment" }).click();
  await expect(moderator.getByText("Why a rule rather than a skill?")).toBeVisible();

  await author.reload();
  await author.getByRole("button", { name: "Withdraw" }).click();
  const withdraw = author.getByRole("dialog", { name: /Withdraw/ });
  await expect(withdraw.getByRole("radio", { name: /Delete for good/ })).toBeDisabled();
  await expect(withdraw.getByText("Reviewers have commented on it or decided it.")).toBeVisible();
  await withdraw.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(author.getByText("It's out of review and doesn't hold its name.")).toBeVisible();

  // Private now: the moderator gets a 404, on the review page and the submission page.
  expect((await moderator.goto(url))?.status()).toBe(404);

  // Out of My submissions' list, and under Archived.
  const name = new RegExp(`@${E2E_SCOPE}/archive-me`);
  await author.goto("/submissions");
  await expect(author.getByRole("row", { name })).toHaveCount(0);
  await author.getByRole("link", { name: /^archived \(/ }).click();
  const row = author.getByRole("row", { name });
  await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(author.getByRole("row", { name })).toHaveCount(0);

  // A draft again, with its conversation; submitting makes revision 2.
  await author.goto(url);
  await expect(author.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await submit(author, "Submit for review");
  await expect(author.getByText("restored it as a draft")).toBeVisible();
  await expect(author.getByText("submitted revision 2")).toBeVisible();
});

test("an author deletes a draft for good from Withdraw", async ({ page }) => {
  await signIn(page, E2E_USERS.archiver);
  await ruleDraft(page, "delete-me");
  await page.getByRole("button", { name: "Withdraw" }).click();
  const withdraw = page.getByRole("dialog", { name: /Withdraw/ });
  await withdraw.getByRole("radio", { name: /Delete for good/ }).check();
  await withdraw.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/submissions$/);
  await expect(page.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/delete-me`) })).toHaveCount(
    0,
  );
  await page.goto("/submissions?status=withdrawn");
  await expect(page.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/delete-me`) })).toHaveCount(
    0,
  );
});

test("an author withdraws a submission pending review from its row in My submissions", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.archiver);
  await ruleDraft(page, "row-withdraw");
  await submit(page, "Submit for review");
  await page.goto("/submissions");
  const name = `@${E2E_SCOPE}/row-withdraw`;
  await page.getByRole("button", { name: `Withdraw: ${name}` }).click();
  const withdraw = page.getByRole("dialog", { name: /Withdraw/ });
  await withdraw.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  await page.goto("/submissions?status=withdrawn");
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
});
