import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("root creates, sorts and searches scopes under Admin; nobody else has a scope page (064)", async ({
  browser,
  request,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root);
  await root.goto("/admin/scopes");
  await root.getByRole("button", { name: "Create scope" }).click();
  const dialog = root.getByRole("dialog");
  await dialog.getByLabel("Name").fill("@E2E-Team");
  await expect(dialog.getByText("@e2e-team/item")).toBeVisible();
  await dialog.getByLabel("Description").fill("Items from the end-to-end tests.");
  await dialog.getByRole("button", { name: "Create scope" }).click();
  await expect(dialog.getByText("Created @e2e-team.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("cell", { name: "@e2e-team", exact: true })).toBeVisible();
  // Sorted on the server (061): newest first by Created, and the view stays in the URL.
  await root.getByRole("link", { name: "Created" }).click();
  await expect(root).toHaveURL(/\/admin\/scopes\?.*sort=created/);
  await expect(root.getByRole("row").nth(1)).toContainText("@e2e-team");
  await root.getByLabel("Search").fill("end-to-end");
  await expect(root).toHaveURL(/q=end-to-end/);
  await expect(root.getByRole("cell", { name: "@e2e-team", exact: true })).toBeVisible();

  // Workspaces (090), in this test because root's sign-ins are limited (e2e-sign-in-limit.md):
  // root creates one; a scope goes in the seeded e2e-acme, whose members (091) the seed adds, and
  // an item released there is filtered by it in the catalogue.
  await root.goto("/admin/workspaces");
  await root.getByRole("button", { name: "New workspace" }).click();
  const create = root.getByRole("dialog", { name: "New workspace" });
  await create.getByLabel("Name").fill("E2E-Labs");
  await create.getByLabel("Description").fill("Labs, for the end-to-end tests.");
  await create.getByRole("button", { name: "Create workspace" }).click();
  await expect(create.getByText("Created e2e-labs.")).toBeVisible();
  await create.getByRole("button", { name: "Done" }).click();
  await root.getByRole("link", { name: "e2e-labs", exact: true }).click();
  await expect(root).toHaveURL(/\/admin\/workspaces\/e2e-labs$/);
  await expect(root.getByText("No scopes yet.")).toBeVisible();

  await root.goto("/admin/scopes");
  await root.getByRole("button", { name: "Create scope" }).click();
  const scopeDialog = root.getByRole("dialog");
  await scopeDialog.getByLabel("Name").fill("e2e-acme-infra");
  await expect(scopeDialog.getByLabel("Workspace")).toHaveValue("00000000000000000000000000");
  await scopeDialog.getByLabel("Workspace").selectOption({ label: "e2e-acme" });
  await scopeDialog.getByLabel("Description").fill("Acme's infrastructure.");
  await scopeDialog.getByRole("button", { name: "Create scope" }).click();
  await expect(scopeDialog.getByText("Created @e2e-acme-infra in e2e-acme.")).toBeVisible();
  await scopeDialog.getByRole("button", { name: "Done" }).click();
  await root.locator("#scope-workspace").selectOption("e2e-acme");
  await expect(root).toHaveURL(/workspace=e2e-acme/);
  await expect(root.getByRole("cell", { name: "@e2e-acme-infra", exact: true })).toBeVisible();
  await expect(root.getByRole("cell", { name: "@e2e-team", exact: true })).toHaveCount(0);
  // The workspace now has a scope, so it can't be deleted.
  await root.goto("/admin/workspaces/e2e-acme");
  await expect(root.getByRole("button", { name: "Delete" })).toBeDisabled();

  // An author uploads and submits an item in the new scope; a moderator approves; it's released.
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.workspaceAuthor, password: E2E_PASSWORD, name: "e2e workspace" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const item = "@e2e-acme-infra/deploy-skill";
  const upload = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name: item,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${item}"\ntype: skill\ndescription: How Acme deploys.\n`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content:
            "---\nname: deploy-skill\ndescription: How Acme deploys.\n---\nDeploy on Tuesdays.\n",
        },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const draft = await upload.json();
  const submitted = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [draft.id] },
  });
  expect(submitted.status()).toBe(200);
  // Roles per workspace (091): a moderator of global only doesn't see acme's submission, in the
  // queue or by its address; e2e-acme's moderator, a plain user in global, finds it and approves.
  const outsider = await browser.newPage();
  await signIn(outsider, E2E_USERS.workspaceOutsider);
  await outsider.goto("/reviews");
  await expect(outsider.getByRole("heading", { name: "Reviews" })).toBeVisible();
  await expect(outsider.getByRole("link", { name: item })).toHaveCount(0);
  expect((await outsider.goto(`/reviews/${draft.id}`))?.status()).toBe(404);
  // And the other way: global's submission isn't in e2e-acme's moderator's queue, nor at its address.
  const elsewhere = "@e2e-seeded/workspace-elsewhere";
  const uploadElsewhere = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name: elsewhere,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${elsewhere}"\ntype: skill\ndescription: In global.\n`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: "---\nname: workspace-elsewhere\ndescription: In global.\n---\nBe kind.\n",
        },
      ],
    },
  });
  expect(uploadElsewhere.status()).toBe(201);
  const elsewhereDraft = await uploadElsewhere.json();
  const elsewhereSubmit = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [elsewhereDraft.id] },
  });
  expect((await elsewhereSubmit.json()).results[0].result).toBe("submitted");
  const moderator = await browser.newPage();
  await signIn(moderator, E2E_USERS.workspaceModerator);
  await moderator.goto("/reviews");
  await expect(moderator.getByRole("link", { name: elsewhere })).toHaveCount(0);
  expect((await moderator.goto(`/reviews/${elsewhereDraft.id}`))?.status()).toBe(404);
  await moderator.goto("/reviews");
  await moderator.getByRole("link", { name: item }).click();
  await expect(moderator).toHaveURL(new RegExp(`/reviews/${draft.id}$`));
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  await moderator
    .getByRole("dialog", { name: "Approve this submission?" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(moderator.getByText("approved it")).toBeVisible();
  const author = await browser.newPage();
  await signIn(author, E2E_USERS.workspaceAuthor);
  await author.goto(`/submissions/${draft.id}`);
  await author.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = author.getByRole("dialog", { name: new RegExp(`Publish ${item}`) });
  await publish.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(publish.getByText(`Published ${item} 1.0.0 as latest.`)).toBeVisible();
  await publish.getByRole("button", { name: "Done" }).click();

  // The catalogue names the workspace on the card, and filters by it, kept in the URL.
  await author.goto("/catalogue");
  const card = author.getByRole("article").filter({ hasText: item });
  await expect(card.getByRole("heading")).toHaveText(new RegExp(`^e2e-acme · , ${item}$`));
  await author.locator("summary", { hasText: "Filters" }).click();
  await author.getByLabel("Workspace").selectOption("e2e-acme");
  await author.getByRole("button", { name: "Apply" }).click();
  await expect(author).toHaveURL(/workspace=e2e-acme/);
  await expect(author.getByRole("article")).toHaveCount(1);
  await expect(
    author.getByRole("list", { name: "Active filters" }).getByRole("link", {
      name: "Remove the workspace filter",
    }),
  ).toBeVisible();
  await author.getByRole("link", { name: item, exact: true }).click();
  await expect(author.getByRole("heading", { level: 1 })).toHaveText(
    new RegExp(`^e2e-acme · , ${item}$`),
  );

  const user = await browser.newPage();
  await signIn(user, E2E_USERS.notRoot);
  await expect(
    user.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Scopes" }),
  ).toHaveCount(0);
  expect((await user.goto("/scopes"))?.status()).toBe(404);
  expect((await user.goto("/admin/scopes"))?.status()).toBe(404);
});
