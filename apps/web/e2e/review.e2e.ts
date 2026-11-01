import { expect, type Page, test } from "@playwright/test";
import { toastWith } from "./toast";
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
  // The queue filters on the server (062): by type, then by name, kept in the URL as chips.
  await moderator.getByLabel("Type").selectOption("hook");
  await expect(moderator).toHaveURL(/type=hook/);
  await expect(row).toBeVisible();
  await moderator.getByLabel("Search").fill("fmt-hook");
  await expect(moderator).toHaveURL(/q=fmt-hook/);
  await expect(moderator.getByRole("link", { name: "Remove the type filter" })).toBeVisible();
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: new RegExp(`@${E2E_SCOPE}/fmt-hook`) }).click();
  const risks = moderator.getByRole("region", { name: /What it can do/ });
  await expect(risks.getByText(/The hook runs the script/)).toBeVisible();
  await expect(risks.getByText(/is an executable shell script/)).toBeVisible();
  await moderator.getByRole("button", { name: "Request changes" }).click();
  const request = moderator.getByRole("dialog", { name: "Request changes" });
  await request.getByLabel("Message").fill("Make the script print what it formatted.");
  await request.getByRole("button", { name: "Request changes" }).click();
  await expect(moderator.getByText("requested changes")).toBeVisible();
  // The page without its tab: a decision opens the Conversation tab (137).
  const reviewUrl = moderator.url().split("?")[0] ?? "";

  // The author hears of it (139): the bell in the top bar counts it, its panel words it, and
  // opening it leads to the submission and marks it read.
  await author.reload();
  const bar = author.getByRole("banner");
  const bell = bar.getByRole("button", { name: "Notifications, 1 unread" });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = author.getByRole("dialog", { name: "Notifications, 1 unread" });
  await expect(panel).toContainText(`Mo Moderator requested changes to @${E2E_SCOPE}/fmt-hook.`);
  await panel.getByRole("link", { name: /requested changes to/ }).click();
  await expect(author).toHaveURL(submissionUrl);
  await expect(bar.getByRole("button", { name: "Notifications, none unread" })).toBeVisible();

  // The author reads it, edits the script, and resubmits.
  await author.goto(submissionUrl);
  // At the top of the page (058), and in the conversation below.
  await expect(
    author.getByRole("status").filter({ hasText: "Changes requested by" }),
  ).toContainText("Make the script print what it formatted.");
  // The review page's screen (137): Edit files opens the editor while it may be changed.
  await author.getByRole("link", { name: "Edit files" }).click();
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
  await moderator.goto(`${reviewUrl}?tab=files`);
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
  await expect(toastWith(publish, "Released")).toBeVisible();
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
  await author.getByRole("link", { name: /^Conversation/ }).click();
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
  // Picked from the list as it's typed (056): it starts on latest, 1.0.0.
  await author.getByRole("combobox", { name: "Add a dependency" }).fill(`@${E2E_SCOPE}/fmt-hook`);
  await author.getByRole("option", { name: new RegExp(`@${E2E_SCOPE}/fmt-hook`) }).click();
  await expect(author.getByLabel(`Version of @${E2E_SCOPE}/fmt-hook`)).toHaveValue("^1.0.0");
  await author.keyboard.press("ControlOrMeta+s");
  await expect(author.getByText(/Saved at/)).toBeVisible();
  await author.getByRole("button", { name: "Submit for review" }).click();
  const second = author.getByRole("dialog", { name: "Submit for review" });
  await expect(second.getByText("All checks passed.")).toBeVisible();
  await second.getByRole("button", { name: "Submit for review" }).click();
  await expect(author.getByText(/Submitted for review on/)).toBeVisible();
});

test("root approves its own submission only with a reason, shown in review and on the Overview (163)", async ({
  page,
}) => {
  const reason = "Hotfix for the outage; reviewed with Mo in a call.";
  await signIn(page, E2E_USERS.overrideRoot);
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  // Root sees every scope, some with "name" in theirs: the field by its role.
  await page.getByRole("textbox", { name: "Name" }).fill("own-rule");
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="rule"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  const submissionUrl = page.url();
  const id = submissionUrl.split("/").at(-1) ?? "";
  await page.getByLabel("description").fill("Keeps the house style.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const submit = page.getByRole("dialog", { name: "Submit for review" });
  await expect(submit.getByText("All checks passed.")).toBeVisible();
  await submit.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();

  // Its own: only the override, which asks why.
  await page.goto(`/reviews/${id}`);
  await page.getByRole("button", { name: "Approve (override)" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve your own submission?" });
  const why = dialog.getByLabel("Why approve your own submission?");
  await expect(why).toHaveAttribute("required", "");
  await dialog.getByRole("button", { name: "Approve (override)" }).click();
  // Without a reason the form isn't sent: the dialog stays, nothing is approved.
  await expect(dialog).toBeVisible();
  await expect(page.getByText("approved their own submission, as root (override)")).toHaveCount(0);
  await why.fill(reason);
  await dialog.getByRole("button", { name: "Approve (override)" }).click();
  await expect(page.getByText("approved their own submission, as root (override)")).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  // Released, the item's Overview shows who approved it, as an override, and why.
  await page.goto(submissionUrl);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = page.getByRole("dialog", { name: new RegExp(`Publish @${E2E_SCOPE}/own-rule`) });
  await publish.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(toastWith(publish, "Released")).toBeVisible();
  await page.goto(`/items/${E2E_SCOPE}/own-rule`);
  await expect(page.getByText("Approved by Ola Override (root override)")).toBeVisible();
  await expect(page.getByText(`Reason: ${reason}`)).toBeVisible();
});
