import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Submitting several drafts at once from My submissions (feature 052): three drafts uploaded with a
 * token, one of them missing its description. Only the two ready ones can be selected; both are
 * submitted with one confirmation, and the third stays a draft with what's in its way.
 */
test("submits the ready drafts selected on My submissions, and leaves the one that isn't ready", async ({
  page,
  request,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.bulkSubmitter, password: E2E_PASSWORD, name: "e2e bulk" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const upload = async (short: string, described: boolean) => {
    const name = `@${E2E_SCOPE}/${short}`;
    const description = described ? "description: A bulk-submitted skill.\n" : "";
    const response = await request.post("/api/v1/drafts", {
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
            content: `---\nname: ${short}\n${description}---\nDo it.\n`,
          },
        ],
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const first = await upload("bulk-one", true);
  const second = await upload("bulk-two", true);
  const blocked = await upload("bulk-blocked", false);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.bulkSubmitter);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/submissions");

  await expect(page.getByLabel(`Select @${E2E_SCOPE}/bulk-one`)).toBeEnabled();
  await expect(
    page.getByLabel(new RegExp(`Fix \\d+ issues? in @${E2E_SCOPE}/bulk-blocked first`)),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Select all ready (2)" }).click();
  await page.getByRole("button", { name: "Submit selected (2)" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit 2 for review" });
  await expect(dialog).toContainText(`@${E2E_SCOPE}/bulk-one`);
  await expect(dialog).toContainText(`@${E2E_SCOPE}/bulk-two`);
  await dialog.getByRole("button", { name: "Submit 2 drafts" }).click();
  const done = page.getByRole("dialog", { name: "Submitted" });
  await expect(done.getByText("Submitted:")).toHaveCount(2);
  await done.getByRole("button", { name: "Done" }).click();

  const status = async (id: string) =>
    page.locator("tr", { has: page.locator(`a[href="/submissions/${id}"]`) });
  await expect(await status(first)).toContainText("submitted");
  await expect(await status(second)).toContainText("submitted");
  await expect(await status(blocked)).toContainText("draft");
  await expect(await status(blocked)).toContainText("to fix");
});
