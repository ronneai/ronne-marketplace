import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("a moderator reviews a hook, the author publishes it, and another item depends on it", async ({
  browser,
}) => {
  // The author writes a hook and submits it.
  const author = await browser.newPage();
  await signIn(author, E2E_USERS.hookAuthor);
  await author.goto("/submissions/new");
  await author
    .locator("label")
    .filter({ has: author.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  await author.getByLabel("Name").fill("fmt-hook");
  await author
    .locator("label")
    .filter({ has: author.locator('input[name="type"][value="hook"]') })
    .click();
  await author.getByRole("button", { name: "Create draft" }).click();
  await expect(author).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  const submissionUrl = author.url();
  await author.getByLabel("description").fill("Formats files after an edit.");
  await author.keyboard.press("ControlOrMeta+s");
  await expect(author.getByText(/Saved at/)).toBeVisible();
  await author.getByRole("button", { name: "Submit for review" }).click();
  const submit = author.getByRole("dialog", { name: "Submit for review" });
  await expect(submit.getByText("All checks passed.")).toBeVisible();
  await expect(submit.getByText("What happens next?")).toBeVisible();
  await submit.getByRole("button", { name: "Submit for review" }).click();
  await expect(author.getByText(/Submitted for review on/)).toBeVisible();

  // The moderator finds it in the queue, flagged, and requests changes.
  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.moderator);
  const nav = moderator.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Reviews.*waiting/ })).toBeVisible();
  await nav.getByRole("link", { name: /Reviews/ }).click();
  const row = moderator.getByRole("row", { name: new RegExp(`@${E2E_SCOPE}/fmt-hook`) });
  await expect(row.getByText("⚠ risk")).toBeVisible();
  await row.getByRole("link", { name: new RegExp(`@${E2E_SCOPE}/fmt-hook`) }).click();
  const risks = moderator.getByRole("region", { name: /What it can do/ });
  await expect(risks.getByText(/The hook runs the script/)).toBeVisible();
  await expect(risks.getByText(/is an executable shell script/)).toBeVisible();
  await moderator.getByRole("button", { name: "Request changes" }).click();
  const request = moderator.getByRole("dialog", { name: "Request changes" });
  await request.getByLabel("Message").fill("Make the script print what it formatted.");
  await request.getByRole("button", { name: "Request changes" }).click();
  await expect(moderator.getByText("requested changes")).toBeVisible();
  const reviewUrl = moderator.url();

  // The author reads it, edits the script, and resubmits.
  await author.goto(submissionUrl);
  await expect(author.getByText("Make the script print what it formatted.")).toBeVisible();
  await author
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /hook\.sh/ })
    .click();
  await author.getByLabel("Contents of hook.sh").click();
  await author.keyboard.press("ControlOrMeta+End");
  await author.keyboard.type('echo "formatted"\n');
  await author.keyboard.press("ControlOrMeta+s");
  await expect(author.getByText(/Saved at/)).toBeVisible();
  await author.getByRole("button", { name: "Resubmit for review" }).click();
  const resubmit = author.getByRole("dialog", { name: "Resubmit for review" });
  await expect(resubmit.getByText("All checks passed.")).toBeVisible();
  await resubmit.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(author.getByText(/Submitted for review on/)).toBeVisible();

  // The moderator sees what changed since revision 1, and approves.
  await moderator.goto(reviewUrl);
  await expect(moderator.getByRole("link", { name: "Changes since revision 1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const change = moderator.getByRole("region", { name: "hook.sh" });
  await expect(change.getByText('echo "formatted"')).toBeVisible();
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  const approve = moderator.getByRole("dialog", { name: "Approve this submission?" });
  await approve.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(moderator.getByText("approved it")).toBeVisible();
  await expect(moderator.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  // The author publishes it: the first release is 1.0.0, on latest (feature 015).
  await author.goto(submissionUrl);
  await author.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = author.getByRole("dialog", {
    name: new RegExp(`Publish @${E2E_SCOPE}/fmt-hook`),
  });
  await expect(publish.getByText(/1\.0\.0 as latest/)).toBeVisible();
  await publish.getByText("What's a tag?").click();
  await expect(publish.getByText(/A name that points to a version/)).toBeVisible();
  await publish.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(
    publish.getByText(`Published @${E2E_SCOPE}/fmt-hook 1.0.0 as latest.`),
  ).toBeVisible();
  await expect(publish.getByText(/sha256 [0-9a-f]{64}/)).toBeVisible();
  await expect(publish.getByRole("link", { name: "View versions" })).toHaveAttribute(
    "href",
    `/items/${E2E_SCOPE}/fmt-hook/versions`,
  );
  await publish.getByRole("button", { name: "Done" }).click();

  // The header, and the release in the conversation, lead to the Versions page, read-only for the
  // author.
  await expect(author.getByRole("link", { name: "View versions" })).toHaveAttribute(
    "href",
    `/items/${E2E_SCOPE}/fmt-hook/versions`,
  );
  await author.getByRole("link", { name: "released it as 1.0.0" }).click();
  await expect(author).toHaveURL(new RegExp(`/items/${E2E_SCOPE}/fmt-hook/versions$`));
  await expect(author.getByText("latest → 1.0.0")).toBeVisible();
  await expect(author.getByRole("button", { name: "Yank", exact: true })).toHaveCount(0);

  // An agent that depends on the released hook now submits.
  await author.goto("/submissions/new");
  await author
    .locator("label")
    .filter({ has: author.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  await author.getByLabel("Name").fill("formatter-agent");
  await author
    .locator("label")
    .filter({ has: author.locator('input[name="type"][value="agent"]') })
    .click();
  await author.getByRole("button", { name: "Create draft" }).click();
  await expect(author).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  await author.getByLabel("description").fill("Formats and reviews.");
  await author.getByRole("button", { name: "Add dependency" }).click();
  await author.getByLabel("Dependency 1: Item").fill(`@${E2E_SCOPE}/fmt-hook`);
  await author.getByLabel("Dependency 1: Range").fill("^1.0.0");
  await author.keyboard.press("ControlOrMeta+s");
  await expect(author.getByText(/Saved at/)).toBeVisible();
  await author.getByRole("button", { name: "Submit for review" }).click();
  const second = author.getByRole("dialog", { name: "Submit for review" });
  await expect(second.getByText("All checks passed.")).toBeVisible();
  await second.getByRole("button", { name: "Submit for review" }).click();
  await expect(author.getByText(/Submitted for review on/)).toBeVisible();
});
