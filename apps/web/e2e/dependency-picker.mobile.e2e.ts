import { expect, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Feature 089 on phones and tablets: the form and `@` offer your own draft, and not someone
 * else's skill in review. The member's draft is made in the editor, so this project's member
 * signs in once and asks for no token; the other skill is a desktop user's, with one token.
 */
const newDraft = async (page: Page, name: string, type: "skill" | "agent") => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(name);
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="type"][value="${type}"]`) })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
};

test("the form and @ offer your own draft, and not someone else's in review", async ({
  page,
  playwright,
}, testInfo) => {
  const project = testInfo.project.name;
  const mine = `@${E2E_SCOPE}/pick-mine-${project}`;
  const theirs = `@${E2E_SCOPE}/pick-theirs-${project}`;

  // Someone else's skill, submitted for review.
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const token = await api.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.downloader, password: E2E_PASSWORD, name: `pick ${project}` },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const description = "description: Someone else's skill.\n";
  const upload = await api.post("/api/v1/drafts", {
    headers,
    data: {
      name: theirs,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${theirs}"\ntype: skill\n${description}`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: `---\nname: pick-theirs-${project}\n${description}---\nDo it.\n`,
        },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const submitted = await api.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [(await upload.json()).id] },
  });
  expect(submitted.status()).toBe(200);

  await signIn(page, mobileUser(testInfo, "member"));
  await newDraft(page, `pick-mine-${project}`, "skill");
  await newDraft(page, `pick-agent-${project}`, "agent");

  // The form: the same query would match both; only mine is offered.
  const search = page.getByRole("combobox", { name: "Add a dependency" });
  await search.fill(`@${E2E_SCOPE}/pick-`);
  const list = page.getByRole("listbox", { name: "Items to depend on" });
  await expect(list.getByRole("option", { name: new RegExp(mine) })).toContainText("draft, yours");
  await expect(list.getByRole("option", { name: new RegExp(theirs) })).toHaveCount(0);
  await search.fill("");

  // `@` in the prompt: the same.
  await page
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /prompt\.md/ })
    .click();
  await page.getByLabel("Contents of prompt.md").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nUse @pick-");
  await expect(page.getByRole("option", { name: new RegExp(mine) })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(theirs) })).toHaveCount(0);
});
