import { type APIRequestContext, expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * A skill names the agent that runs it in its frontmatter (097): `agent: @scope/name`, typed as
 * people write it, is saved quoted and becomes a dependency, and the skill submits. It borrows
 * proposer, who signs in once elsewhere (proposals.e2e.ts).
 */
const agent = `@${E2E_SCOPE}/fm-agent`;
const skill = `@${E2E_SCOPE}/fm-skill`;

const upload = async (
  request: APIRequestContext,
  headers: Record<string, string>,
  files: { path: string; content: string }[],
  name: string,
  type: "agent" | "skill",
) => {
  const response = await request.post("/api/v1/drafts", {
    headers,
    data: { name, type, files: files.map((f) => ({ ...f, encoding: "utf8" })) },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
};

test("agent: @scope/name in a skill's frontmatter is saved quoted, as a dependency, and submits", async ({
  page,
  request,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.proposer, password: E2E_PASSWORD, name: "e2e frontmatter" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  // The proposer's agent, in review, and a skill draft that doesn't name it yet.
  const agentId = await upload(
    request,
    headers,
    [
      {
        path: "ronne.yaml",
        content: `name: "${agent}"\ntype: agent\ndescription: Runs skills.\nagent:\n  prompt: prompt.md\n`,
      },
      { path: "prompt.md", content: "Run the skill.\n" },
    ],
    agent,
    "agent",
  );
  const submitted = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [agentId] },
  });
  expect(submitted.status()).toBe(200);
  const skillId = await upload(
    request,
    headers,
    [
      {
        path: "ronne.yaml",
        content: `name: "${skill}"\ntype: skill\ndescription: Runs in an agent.\nskill:\n  entry: SKILL.md\n`,
      },
      {
        path: "SKILL.md",
        content: "---\nname: fm-skill\ndescription: Runs in an agent.\n---\nDo it.\n",
      },
    ],
    skill,
    "skill",
  );

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.proposer);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  // Typed in the frontmatter, after the description, as people write it: unquoted.
  await page.goto(`/submissions/${skillId}`);
  const files = page.getByRole("list", { name: "Files" });
  await files.getByRole("button", { name: /SKILL\.md/ }).click();
  const editor = page.getByLabel("Contents of SKILL.md");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.type(`\nagent: ${agent}`);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved at/)).toBeVisible();
  // It parses (no YAML problem), is saved quoted, and is listed as a dependency. The one problem
  // is Submit's warning that the agent is still in review (#142), which doesn't stop it.
  await expect(page.getByText(/frontmatter isn't valid YAML/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Problems: 1 warning", exact: true }),
  ).toBeVisible();
  await expect(editor).toContainText(`agent: "${agent}"`);
  await files.getByRole("button", { name: /ronne\.yaml/ }).click();
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  await expect(page.getByLabel("Contents of ronne.yaml")).toContainText(`"${agent}": ^1.0.0`);

  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit for review" });
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
});
