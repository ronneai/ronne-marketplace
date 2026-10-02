import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Dependencies on their way (feature 056): a bundle and the skill it uses go through review
 * together. Submitting the bundle includes the skill; once both are approved, the bundle's Publish
 * waits until the skill is released. Rejecting a skill offers to send its bundle back too.
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

/** The author's token, and a skill draft plus a bundle draft that depends on it. */
const uploadPair = async (request: APIRequestContext, skill: string, kit: string) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.pendingAuthor, password: E2E_PASSWORD, name: `e2e ${kit}` },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const upload = async (data: unknown) => {
    const response = await request.post("/api/v1/drafts", { headers, data });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const description = "description: A skill that waits for no one.\n";
  const skillId = await upload({
    name: `@${E2E_SCOPE}/${skill}`,
    type: "skill",
    files: [
      {
        path: "ronne.yaml",
        encoding: "utf8",
        content: `name: "@${E2E_SCOPE}/${skill}"\ntype: skill\n${description}`,
      },
      {
        path: "SKILL.md",
        encoding: "utf8",
        content: `---\nname: ${skill}\n${description}---\nDo it.\n`,
      },
    ],
  });
  const kitId = await upload({
    name: `@${E2E_SCOPE}/${kit}`,
    type: "bundle",
    files: [
      {
        path: "ronne.yaml",
        encoding: "utf8",
        content: `name: "@${E2E_SCOPE}/${kit}"\ntype: bundle\ndescription: A set.\ndependencies:\n  "@${E2E_SCOPE}/${skill}": "^1.0.0"\n`,
      },
    ],
  });
  // Only the bundle is named: its skill draft is included, and goes first.
  const submitted = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [kitId] },
  });
  expect(submitted.status()).toBe(200);
  expect(
    ((await submitted.json()).results as { id: string; result: string }[]).map((r) => [
      r.id,
      r.result,
    ]),
  ).toEqual([
    [skillId, "submitted"],
    [kitId, "submitted"],
  ]);
  return { skillId, kitId };
};

const approve = async (moderator: Page, id: string) => {
  await moderator.goto(`/reviews/${id}`);
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  await moderator
    .getByRole("dialog", { name: "Approve this submission?" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(moderator.getByText("approved it")).toBeVisible();
};

const publish = async (author: Page, id: string, name: string) => {
  await author.goto(`/submissions/${id}`);
  await author.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = author.getByRole("dialog", { name: new RegExp(`Publish @${E2E_SCOPE}/${name}`) });
  await dialog.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(dialog.getByText(`Published @${E2E_SCOPE}/${name} 1.0.0 as latest.`)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
};

test("a bundle and its skill are reviewed together; the bundle is released after the skill", async ({
  browser,
  request,
}) => {
  const { skillId, kitId } = await uploadPair(request, "pd-skill", "pd-kit");
  const moderator = await signedIn(browser, E2E_USERS.pendingModerator);
  await moderator.goto(`/reviews/${kitId}`);
  await expect(moderator.getByText(`Waits on @${E2E_SCOPE}/pd-skill (in review)`)).toBeVisible();
  await approve(moderator, kitId);
  await approve(moderator, skillId);

  const author = await signedIn(browser, E2E_USERS.pendingAuthor);
  await author.goto(`/submissions/${kitId}`);
  await expect(
    author.getByRole("button", { name: `Publish: Waits on @${E2E_SCOPE}/pd-skill (approved)` }),
  ).toBeDisabled();
  await publish(author, skillId, "pd-skill");
  await publish(author, kitId, "pd-kit");
});

test("rejecting a skill sends the bundle that uses it back to its author", async ({
  browser,
  request,
}) => {
  const { skillId, kitId } = await uploadPair(request, "pd-gone", "pd-kit-two");
  const moderator = await signedIn(browser, E2E_USERS.pendingModerator);
  await moderator.goto(`/reviews/${skillId}`);
  await moderator.getByRole("button", { name: "Reject", exact: true }).click();
  const reject = moderator.getByRole("dialog", { name: "Reject this submission?" });
  await expect(reject.getByText("1 submission depends on this")).toBeVisible();
  await expect(reject.getByLabel("Request changes on them too")).toBeChecked();
  await reject.getByLabel("Message", { exact: true }).fill("It duplicates another skill.");
  await reject.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(moderator.getByText("rejected it")).toBeVisible();

  await moderator.goto(`/reviews/${kitId}`);
  await expect(moderator.getByText(`@${E2E_SCOPE}/pd-gone was rejected: remove it`)).toBeVisible();
  await expect(moderator.getByText("changes requested").first()).toBeVisible();
});
