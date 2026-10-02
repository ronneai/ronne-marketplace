import { type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Approving several submissions at once from the review queue (feature 054): an author submits
 * three skills; a moderator selects all three and opens the confirmation, the author withdraws one
 * meanwhile, and the moderator approves with one message. Two are approved with that message; the
 * withdrawn one is reported, not approved.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const withdrawAsAuthor = async (browser: Browser, id: string) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, E2E_USERS.approveAuthor);
  await page.goto(`/submissions/${id}`);
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page
    .getByRole("dialog", { name: /Withdraw/ })
    .getByRole("button", { name: "Withdraw" })
    .click();
  await expect(page.getByText("It stays here, read-only, for history.")).toBeVisible();
  await context.close();
};

test("approves the selected submissions with one message, and reports one withdrawn meanwhile", async ({
  page,
  request,
  browser,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.approveAuthor, password: E2E_PASSWORD, name: "e2e approve" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const upload = async (short: string) => {
    const name = `@${E2E_SCOPE}/${short}`;
    const description = "description: A skill approved in bulk.\n";
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
  const ids = [
    await upload("approve-one"),
    await upload("approve-two"),
    await upload("approve-gone"),
  ];
  const submitted = await request.post("/api/v1/drafts/submit", { headers, data: { ids } });
  expect(submitted.status()).toBe(200);

  await signIn(page, E2E_USERS.bulkApprover);
  await page.goto("/reviews");
  for (const short of ["approve-one", "approve-two", "approve-gone"])
    await page.getByLabel(`Select @${E2E_SCOPE}/${short}`).check();
  await page.getByRole("button", { name: "Approve selected (3)" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve 3 submissions?" });
  await expect(dialog).toContainText(`@${E2E_SCOPE}/approve-gone`);

  await withdrawAsAuthor(browser, ids[2] ?? "");

  await dialog.getByLabel("Message (optional)").fill("Approved together.");
  await dialog.getByRole("button", { name: "Approve 3 submissions" }).click();
  const done = page.getByRole("dialog", { name: "Approved" });
  await expect(done.getByText("Approved:", { exact: true })).toHaveCount(2);
  await expect(done.getByText("Not approved:", { exact: true })).toHaveCount(1);
  await expect(done).toContainText("archived");
  await done.getByRole("button", { name: "Done" }).click();

  await page.goto(`/reviews/${ids[0]}`);
  await expect(page.getByText("Approved together.")).toBeVisible();
});
