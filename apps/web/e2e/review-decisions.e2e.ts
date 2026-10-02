import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Request changes and reject from the review queue's rows and the review page (feature 058), and
 * what the author sees: the reviewer's reason at the top of their page and on My submissions.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

/** A rule, submitted for review. Returns its submission page's URL. */
const submittedRule = async (page: Page, name: string) => {
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
  const url = page.url();
  await page.getByLabel("description").fill("A rule for the review decisions test.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit for review" });
  await expect(dialog.getByText("All checks passed.")).toBeVisible();
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
  return url;
};

/** Decides from a queue row: opens its dialog, writes the reason, and confirms. */
const decideFromRow = async (
  page: Page,
  name: string,
  decision: "Request changes" | "Reject",
  reason: string,
) => {
  const full = `@${E2E_SCOPE}/${name}`;
  await page.getByRole("button", { name: `${decision}: ${full}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Message").fill(reason);
  await dialog.getByRole("button", { name: decision, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: full })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(full) })).toHaveCount(0);
};

test("a moderator requests changes and rejects from the queue, and the author reads why", async ({
  browser,
}) => {
  const author = await browser.newPage();
  await signIn(author, E2E_USERS.decisionAuthor);
  const fixUrl = await submittedRule(author, "fix-me");
  const rejectUrl = await submittedRule(author, "reject-me");

  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.decisionModerator);
  await moderator.goto("/reviews");
  await decideFromRow(moderator, "fix-me", "Request changes", "Say which files it covers.");
  await decideFromRow(moderator, "reject-me", "Reject", "We already have @e2e-seeded/versioned.");

  // The reasons, at the top of each page and on My submissions.
  await author.goto(rejectUrl);
  await expect(author.getByText("Rejected by Remy Moderator")).toBeVisible();
  await expect(author.getByText("We already have @e2e-seeded/versioned.").first()).toBeVisible();
  await expect(author.getByText("Rejected is final")).toBeVisible();
  await expect(author.getByText("You can withdraw it")).toHaveCount(0);
  await author.goto("/submissions");
  await expect(author.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/fix-me`) })).toContainText(
    "Changes requested by Remy Moderator: Say which files it covers.",
  );

  // The author fixes it and resubmits.
  await author.goto(fixUrl);
  await expect(author.getByText("Changes requested by Remy Moderator")).toBeVisible();
  await author.getByLabel("description").fill("A rule for the review decisions test, all files.");
  await author.keyboard.press("ControlOrMeta+s");
  await expect(author.getByText(/Saved at/)).toBeVisible();
  await author.getByRole("button", { name: "Resubmit for review" }).click();
  const resubmit = author.getByRole("dialog", { name: "Resubmit for review" });
  await resubmit.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(author.getByText(/Submitted for review on/)).toBeVisible();
});

test("a moderator sends an approved one back from To release", async ({ browser }) => {
  const author = await browser.newPage();
  await signIn(author, E2E_USERS.decisionAuthor);
  const url = await submittedRule(author, "send-back-me");

  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.decisionModerator);
  await moderator.goto(url.replace("/submissions/", "/reviews/"));
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(moderator.getByRole("button", { name: "Request changes" })).toBeVisible();

  await moderator.goto("/reviews?tab=release");
  await expect(
    moderator.getByRole("button", { name: `Reject: @${E2E_SCOPE}/send-back-me` }),
  ).toHaveCount(0);
  await decideFromRow(moderator, "send-back-me", "Request changes", "Wait for the next lint.");
  await author.goto(url);
  await expect(author.getByText("Wait for the next lint.").first()).toBeVisible();
});

test("a moderator's own submission shows the decisions greyed out, with why", async ({ page }) => {
  await signIn(page, E2E_USERS.decisionModerator);
  const url = await submittedRule(page, "my-own");
  const reason = "Your own submission: another moderator or root decides.";

  await page.goto("/reviews");
  const row = page.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/my-own`) });
  await expect(row.getByRole("button", { name: /^Reject:/ })).toBeDisabled();
  await expect(row.getByRole("button", { name: /^Request changes:/ })).toBeDisabled();

  await page.goto(url.replace("/submissions/", "/reviews/"));
  for (const name of ["Approve", "Request changes", "Reject"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await expect(page.getByText(reason).first()).toBeAttached();
  await expect(page.getByText("This is your own submission")).toBeVisible();
});
