import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Who can be picked as a dependency (feature 089): your own items in any state, others' only once
 * published, in the form, `@` in markdown and the canvas alike. It borrows users that sign in once
 * or twice elsewhere, so nobody nears the sign-in limit and Admin › Users keeps its first page.
 * Phones and tablets: dependency-picker.mobile.e2e.ts.
 */
const signedIn = async (browser: Browser, email: string): Promise<Page> => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
};

/** A skill draft by `email`, uploaded with a token; submitted for review when asked. */
const uploadSkill = async (
  request: APIRequestContext,
  email: string,
  name: string,
  submit: boolean,
) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name: `e2e ${name}` },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const description = "description: A skill to pick.\n";
  const upload = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name: `@${E2E_SCOPE}/${name}`,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@${E2E_SCOPE}/${name}"\ntype: skill\n${description}`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: `---\nname: ${name}\n${description}---\nDo it.\n`,
        },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const id = (await upload.json()).id as string;
  if (submit) {
    const submitted = await request.post("/api/v1/drafts/submit", { headers, data: { ids: [id] } });
    expect(submitted.status()).toBe(200);
  }
  return id;
};

/** A new agent draft, opened in the editor. */
const newAgent = async (page: Page, name: string) => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(name);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="agent"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
};

const mine = `@${E2E_SCOPE}/pick-mine`;
const theirs = `@${E2E_SCOPE}/pick-theirs`;

/** The form's search: the options it offers for `q`. */
const formOptions = async (page: Page, q: string) => {
  const search = page.getByRole("combobox", { name: "Add a dependency" });
  await search.fill(q);
  const list = page.getByRole("listbox", { name: "Items to depend on" });
  await expect(list.getByRole("option", { name: new RegExp(mine) })).toBeVisible();
  return list;
};

test("you can pick your own draft anywhere, and someone else's skill only once it's published", async ({
  browser,
  request,
}) => {
  await uploadSkill(request, E2E_USERS.composer, "pick-mine", false);
  const theirsId = await uploadSkill(request, E2E_USERS.outsider, "pick-theirs", true);

  const author = await signedIn(browser, E2E_USERS.composer);
  await newAgent(author, "pick-agent");

  // The form: my draft, and not their skill in review.
  const list = await formOptions(author, `@${E2E_SCOPE}/pick-`);
  await expect(list.getByRole("option", { name: new RegExp(mine) })).toContainText("draft, yours");
  await expect(list.getByRole("option", { name: new RegExp(theirs) })).toHaveCount(0);
  await author.getByRole("combobox", { name: "Add a dependency" }).fill("");

  // `@` in the prompt offers the same.
  await author
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /prompt\.md/ })
    .click();
  const prompt = author.getByLabel("Contents of prompt.md");
  await prompt.click();
  await author.keyboard.press("ControlOrMeta+End");
  await author.keyboard.type("\nUse @pick-");
  await expect(author.getByRole("option", { name: new RegExp(mine) })).toBeVisible();
  await expect(author.getByRole("option", { name: new RegExp(theirs) })).toHaveCount(0);
  await author.keyboard.press("Escape");

  // The canvas: my draft with its status, and not theirs.
  await author
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /ronne\.yaml/ })
    .click();
  await author.getByRole("button", { name: "Canvas", exact: true }).click();
  const picker = author.getByRole("region", { name: "Add from the catalogue" });
  await picker.getByLabel("Search the catalogue").fill("pick-");
  await expect(picker.getByText(mine, { exact: true })).toBeVisible();
  await expect(picker.getByText("draft, yours")).toBeVisible();
  await expect(picker.getByText(theirs, { exact: true })).toHaveCount(0);

  // Their skill is approved and published: now it's offered, as published.
  const moderator = await signedIn(browser, E2E_USERS.depsModerator);
  await moderator.goto(`/reviews/${theirsId}`);
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  await moderator
    .getByRole("dialog", { name: "Approve this submission?" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(moderator.getByText("approved it")).toBeVisible();
  const other = await signedIn(browser, E2E_USERS.outsider);
  await other.goto(`/submissions/${theirsId}`);
  await other.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = other.getByRole("dialog", { name: new RegExp(`Publish ${theirs}`) });
  await dialog.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(dialog.getByText(`Published ${theirs} 1.0.0 as latest.`)).toBeVisible();

  await picker.getByLabel("Search the catalogue").fill("pick-t");
  await expect(picker.getByText(theirs, { exact: true })).toBeVisible();
  await author.getByRole("button", { name: "Form", exact: true }).click();
  const after = await formOptions(author, `@${E2E_SCOPE}/pick-`);
  await expect(after.getByRole("option", { name: new RegExp(theirs) })).toContainText(
    "published 1.0.0",
  );
  await author.getByRole("combobox", { name: "Add a dependency" }).fill("");

  // And `@` offers it too.
  await author
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /prompt\.md/ })
    .click();
  await author.getByLabel("Contents of prompt.md").click();
  await author.keyboard.press("ControlOrMeta+End");
  await author.keyboard.type("\nAlso @pick-t");
  await expect(author.getByRole("option", { name: new RegExp(theirs) })).toBeVisible();
  await author.keyboard.press("Escape");
});
