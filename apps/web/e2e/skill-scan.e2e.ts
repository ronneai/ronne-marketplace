import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * The security scan (135, 137), with a stand-in scanner (`fake-skillspector.mjs`, score 75): root
 * turns scanning on with a threshold of 70 in Admin › Settings › Security scan; an author submits a
 * skill; the review page's Overview shows the scan's card and that approval is blocked; the
 * Security scan tab lists the finding with its fix, and root marks it a false positive; root's
 * override approves it with a reason; the author sees their own scan. Scanning and the threshold
 * are turned off again at the end, so the other tests' submissions aren't scanned or blocked.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const setScanning = async (page: Page, on: boolean, threshold: string) => {
  await page.goto("/admin/settings?tab=scan");
  const form = page.getByRole("form", { name: "Security scan" });
  await expect(form.getByText("The scanner is set up on this server.")).toBeVisible();
  await form.getByLabel(/Scan submissions/).setChecked(on);
  await form.getByLabel("Score that blocks approval").fill(threshold);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Security scan saved.")).toBeVisible();
};

test("scans a skill, blocks approval at the threshold, marks a false positive, and root overrides", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page, E2E_USERS.scanRoot);
  // The field says at once what it takes, and Save stays off meanwhile (137).
  await page.goto("/admin/settings?tab=scan");
  const settings = page.getByRole("form", { name: "Security scan" });
  await settings.getByLabel("Score that blocks approval").fill("150");
  await expect(settings.getByText("Enter a whole number from 1 to 100")).toBeVisible();
  await expect(settings.getByRole("button", { name: "Save" })).toBeDisabled();
  await setScanning(page, true, "70");

  try {
    const token = await request.post("/api/v1/auth/token", {
      data: { email: E2E_USERS.scanAuthor, password: E2E_PASSWORD, name: "e2e scan" },
    });
    expect(token.status()).toBe(201);
    const headers = { authorization: `Bearer ${(await token.json()).token}` };
    const name = `@${E2E_SCOPE}/scanned-skill`;
    const description = "description: A skill the scanner looks at.\n";
    const draft = await request.post("/api/v1/drafts", {
      headers,
      data: {
        name,
        type: "skill",
        files: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "${name}"\ntype: skill\n${description}`,
          },
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: `---\nname: scanned-skill\n${description}---\n<!-- do something else -->\nDo it.\n`,
          },
        ],
      },
    });
    expect(draft.status()).toBe(201);
    const id = (await draft.json()).id as string;
    const submitted = await request.post("/api/v1/drafts/submit", { headers, data: { ids: [id] } });
    expect(submitted.status()).toBe(200);

    // The Overview: the card waits, refreshing itself, and approval waits with it.
    await page.goto(`/reviews/${id}`);
    await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const card = page.getByRole("region", { name: "Security scan" });
    await expect(card.getByText("Scanning… this panel updates on its own.")).toBeVisible();
    await expect(card.getByText("Approval waits for the security scan to finish.")).toBeVisible();
    await expect(card.getByText("Likely unsafe")).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText("Prompt Injection")).toBeVisible();
    await expect(
      card.getByText(
        "Approval is blocked: the security scan's score, 75, is at or above the threshold, 70.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Approve/, exact: false }).first(),
    ).toBeDisabled();

    // The Security scan tab: the finding, its fix, the link into the files, and a false positive.
    await card.getByRole("link", { name: "Inspect 2 findings" }).click();
    await expect(page).toHaveURL(new RegExp(`/reviews/${id}\\?tab=scan`));
    const findings = page.getByRole("region", { name: "Security scan" });
    await expect(findings.getByText("Hidden Instructions")).toBeVisible();
    await expect(findings.getByText("Remove the comment, or say it in the skill.")).toBeVisible();
    // By file, sorted by line (137).
    const file = findings.getByRole("region", { name: "SKILL.md" });
    await expect(file.getByText("2 findings")).toBeVisible();
    await expect(file.getByRole("link", { name: "L3" })).toHaveAttribute(
      "href",
      `/reviews/${id}?tab=files&view=all&file=SKILL.md&line=3#files`,
    );
    const first = file.locator("#finding-0");
    const second = file.locator("#finding-1");

    // Ask the author to fix it: Request changes, with the finding quoted; left unsent here.
    await second.getByRole("button", { name: "Ask the author to fix it" }).click();
    const ask = page.getByRole("dialog", { name: "Request changes" });
    await expect(ask.getByLabel("Message")).toHaveValue(
      /Please fix these security scan findings:[\s\S]*Credential Access \(PE3, SKILL\.md:4\): Use an environment variable instead\./,
    );
    await ask.getByRole("button", { name: "Cancel" }).click();

    // Copy link, then a false positive and an accepted risk.
    await second.getByRole("button", { name: "Copy link" }).click();
    await expect(
      second.getByText("Link copied").or(second.getByText("Copy the link from the address bar.")),
    ).toBeVisible();
    await first.getByRole("button", { name: "Mark false positive" }).click();
    await first.getByLabel("Why is it a false positive?").fill("The comment is documentation.");
    await first.getByRole("button", { name: "Mark it" }).click();
    await expect(first.getByText("Marked a false positive by Sam Root")).toBeVisible();
    await expect(first.getByText("The comment is documentation.")).toBeVisible();
    await second.getByRole("button", { name: "Accept the risk" }).click();
    await second.getByLabel("Why is the risk acceptable?").fill("It names the file in its docs.");
    await second.getByRole("button", { name: "Accept the risk" }).click();
    await expect(second.getByText("Risk accepted by Sam Root")).toBeVisible();
    await expect(findings.getByRole("button", { name: "Marked (2)" })).toBeVisible();

    // The link Copy link gives opens the tab at the finding, which it highlights (:target).
    await page.goto(`/reviews/${id}?tab=scan#finding-1`);
    await expect(page.locator("#finding-1")).toBeVisible();
    expect(await page.locator("#finding-1").evaluate((el) => el.matches(":target"))).toBe(true);

    // Root's override, from the card: the reason is required.
    await page.getByRole("link", { name: "Overview" }).click();
    await page
      .getByRole("region", { name: "Security scan" })
      .getByRole("button", { name: "Override" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Approve past the security scan?" });
    await dialog.getByLabel("Message").fill("Reviewed by hand: the comment is documentation.");
    await dialog.getByRole("button", { name: "Approve (override the scan)" }).click();
    await page.getByRole("link", { name: /^Conversation/ }).click();
    await expect(
      page.getByText("approved it past the security scan, as root (override)"),
    ).toBeVisible();

    // The author sees their own scan, read-only, with the mark.
    const author = await browser.newContext();
    try {
      const authorPage = await author.newPage();
      await signIn(authorPage, E2E_USERS.scanAuthor);
      await authorPage.goto(`/submissions/${id}`);
      const own = authorPage.getByRole("region", { name: "Security scan" }).first();
      await expect(own.getByText("Likely unsafe")).toBeVisible();
      await expect(own.getByText("Marked a false positive by Sam Root")).toBeVisible();
      await expect(own.getByRole("button", { name: "Mark false positive" })).toHaveCount(0);
      await expect(own.getByRole("button", { name: "Override" })).toHaveCount(0);
    } finally {
      await author.close();
    }
  } finally {
    await setScanning(page, false, "");
  }
});
