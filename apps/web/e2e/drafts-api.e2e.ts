import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

/**
 * The draft upload API (feature 037), as `rmk export` will use it: a token from the API, the
 * scopes, then a draft with its files, which its author opens in the web editor and no one else can.
 */
test("a draft uploaded with a token opens in its author's editor with its files, and is private", async ({
  browser,
  request,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.exporter, password: E2E_PASSWORD, name: "e2e export" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };

  const scopes = await request.get(`/api/v1/scopes?q=${E2E_SCOPE}`, { headers });
  expect(scopes.status()).toBe(200);
  expect((await scopes.json()).scopes.map((s: { name: string }) => s.name)).toContain(E2E_SCOPE);

  const name = `@${E2E_SCOPE}/exported-skill`;
  const upload = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${name}"\ntype: skill\ndescription: Exported from a laptop.\n`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content:
            "---\nname: exported-skill\ndescription: Exported from a laptop.\n---\nCheck the diff.\n",
        },
        { path: "scripts/check.sh", encoding: "utf8", content: "#!/bin/sh\n", executable: true },
        { path: "logo.png", encoding: "base64", content: "iVBORw0KGgo=" },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const draft = await upload.json();
  expect(draft).toMatchObject({ name, type: "skill", status: "draft", files: 4, issues: [] });
  expect(draft.url).toBe(`${baseURL}/submissions/${draft.id}`);

  const author = await browser.newPage();
  await signIn(author, E2E_USERS.exporter);
  await author.goto(draft.url);
  await expect(author.getByText(name).first()).toBeVisible();
  const files = author.getByRole("list", { name: "Files" });
  for (const path of ["SKILL.md", "logo.png", "ronne.yaml", "check.sh"])
    await expect(
      files.getByRole("button", { name: new RegExp(path.replace(".", "\\.")) }),
    ).toBeVisible();
  await files.getByRole("button", { name: /SKILL\.md/ }).click();
  await expect(author.getByLabel("Contents of SKILL.md")).toContainText("Check the diff.");

  const outsider = await browser.newPage();
  await signIn(outsider, E2E_USERS.outsider);
  expect((await outsider.goto(draft.url))?.status()).toBe(404);
});
