import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_PROPOSAL_ITEM, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const itemUrl = `/items/${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}`;

/** Proposes a change from the item page, and returns the editor's URL. */
const propose = async (page: Page) => {
  await page.goto(itemUrl);
  await page.getByRole("button", { name: "Propose a change", exact: true }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  await expect(
    page.getByText(`A change to @${E2E_SCOPE}/${E2E_PROPOSAL_ITEM} 1.0.0.`),
  ).toBeVisible();
  return page.url();
};

const save = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
};

const submit = async (page: Page, label: "Submit for review" | "Resubmit for review") => {
  await page.getByRole("button", { name: label }).click();
  const dialog = page.getByRole("dialog", { name: label });
  await expect(dialog.getByText("All checks passed.")).toBeVisible();
  await dialog.getByRole("button", { name: label }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
};

const approve = async (page: Page, editorUrl: string) => {
  await page.goto(editorUrl.replace("/submissions/", "/reviews/"));
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this submission?" });
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("approved it")).toBeVisible();
};

test("a user proposes a change, a newer version comes out, the user rebases, and releases 1.1.0", async ({
  browser,
}) => {
  // The user proposes a new description for 1.0.0, and submits it.
  const proposer = await browser.newPage();
  await signIn(proposer, E2E_USERS.proposer);
  const mine = await propose(proposer);
  await proposer.getByLabel("description").fill("Prompts for commit messages that say why.");
  await save(proposer);
  await submit(proposer, "Submit for review");

  // Meanwhile a moderator's own change to the README is approved and released as 1.0.1.
  const releaser = await browser.newPage();
  await signIn(releaser, E2E_USERS.releaser);
  const theirs = await propose(releaser);
  const files = releaser.getByRole("list", { name: "Files" });
  await files.getByRole("button", { name: /README\.md/ }).click();
  await releaser.getByLabel("Contents of README.md").click();
  await releaser.keyboard.press("ControlOrMeta+a");
  await releaser.keyboard.type("# Prompt kit\n\nNow with examples.\n");
  await save(releaser);
  await submit(releaser, "Submit for review");
  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.moderator);
  await approve(moderator, theirs);
  await releaser.goto(theirs);
  await releaser.getByRole("button", { name: "Publish", exact: true }).click();
  const publishTheirs = releaser.getByRole("dialog", { name: /^Publish/ });
  await expect(publishTheirs.getByText(/Suggested: patch/)).toBeVisible();
  await publishTheirs.getByRole("button", { name: "Publish 1.0.1" }).click();
  await expect(
    publishTheirs.getByText(`Published @${E2E_SCOPE}/${E2E_PROPOSAL_ITEM} 1.0.1 as latest.`),
  ).toBeVisible();

  // The user's proposal is now stale: the moderator can't approve it; the user rebases.
  await moderator.goto(mine.replace("/submissions/", "/reviews/"));
  await expect(
    moderator.getByText("1.0.1 has been released since this proposal started."),
  ).toBeVisible();
  await proposer.goto(mine);
  await expect(
    proposer.getByText("1.0.1 has been released since this proposal started."),
  ).toBeVisible();
  await proposer.getByRole("button", { name: "Rebase onto 1.0.1" }).click();
  await expect(
    proposer.getByText(`A change to @${E2E_SCOPE}/${E2E_PROPOSAL_ITEM} 1.0.1.`),
  ).toBeVisible();
  // It keeps the user's description and brings in the README from 1.0.1.
  await expect(proposer.getByLabel("description")).toHaveValue(
    "Prompts for commit messages that say why.",
  );
  await submit(proposer, "Resubmit for review");

  // The moderator sees the change against 1.0.1 and approves it; the user releases it as 1.1.0.
  await moderator.goto(mine.replace("/submissions/", "/reviews/"));
  await expect(moderator.getByRole("link", { name: "Changes to 1.0.1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    moderator.getByText("Prompts for commit messages that say why.").first(),
  ).toBeVisible();
  await approve(moderator, mine);
  await proposer.goto(mine);
  await proposer.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = proposer.getByRole("dialog", { name: /^Publish/ });
  await publish.getByRole("radio", { name: /Minor/ }).check();
  await publish.getByRole("button", { name: "Publish 1.1.0" }).click();
  await expect(
    publish.getByText(`Published @${E2E_SCOPE}/${E2E_PROPOSAL_ITEM} 1.1.0 as latest.`),
  ).toBeVisible();

  // The item page shows it.
  await proposer.goto(itemUrl);
  await expect(proposer.getByText("v1.1.0")).toBeVisible();
});
