import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * The security scan (135), with a stand-in scanner (`fake-skillspector.mjs`): root turns scanning
 * on in Admin › Settings › Security scan; an author submits a skill; the review page shows the
 * scan's finding beside the risk flags, and root can still approve. Scanning is turned off again
 * at the end, so the other tests' submissions aren't scanned.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const setScanning = async (page: Page, on: boolean) => {
  await page.goto("/admin/settings?tab=scan");
  const form = page.getByRole("form", { name: "Security scan" });
  await expect(form.getByText("The scanner is set up on this server.")).toBeVisible();
  await form.getByLabel(/Scan submissions/).setChecked(on);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Security scan saved.")).toBeVisible();
};

test("scans a submitted skill, shows the finding on the review page, and approval still works", async ({
  page,
  request,
}) => {
  await signIn(page, E2E_USERS.scanRoot);
  await setScanning(page, true);

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

    await page.goto(`/reviews/${id}`);
    const panel = page.getByRole("region", { name: "Security scan" });
    // Queued or running first, then scanned: the panel refreshes itself while it waits.
    await expect(panel.getByText("Scanning… this panel updates on its own.")).toBeVisible();
    await expect(panel.getByText("Likely unsafe")).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("Hidden Instructions")).toBeVisible();
    await expect(panel.getByRole("link", { name: "SKILL.md:3" })).toHaveAttribute(
      "href",
      `/reviews/${id}?view=all&file=SKILL.md&line=3#files`,
    );
    await expect(panel.getByText("Static scan by SkillSpector 2.13.2-e2e.")).toBeVisible();

    // Advisory: approving works whatever the scan says.
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Approve this submission?" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await expect(page.getByText("approved it")).toBeVisible();
  } finally {
    await setScanning(page, false);
  }
});
