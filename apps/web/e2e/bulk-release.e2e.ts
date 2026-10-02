import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/**
 * Releasing many at once (feature 055): an agent and the skill it uses, both approved. A moderator
 * ticks only the agent on the To release tab; the skill is added as its dependency, both are
 * released in one batch, skill first, and rmk installs the agent with its skill.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("releases an agent and the skill it uses in one batch, then rmk installs them", async ({
  page,
  request,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.releaseAuthor, password: E2E_PASSWORD, name: "e2e release" },
  });
  expect(token.status()).toBe(201);
  const secret = (await token.json()).token as string;
  const headers = { authorization: `Bearer ${secret}` };
  const skill = `@${E2E_SCOPE}/rel-skill`;
  const agent = `@${E2E_SCOPE}/rel-agent`;
  const upload = async (data: unknown) => {
    const response = await request.post("/api/v1/drafts", { headers, data });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const description = "description: Writes release notes that say why.\n";
  const skillId = await upload({
    name: skill,
    type: "skill",
    files: [
      {
        path: "ronne.yaml",
        encoding: "utf8",
        content: `name: "${skill}"\ntype: skill\n${description}`,
      },
      {
        path: "SKILL.md",
        encoding: "utf8",
        content: `---\nname: rel-skill\n${description}---\nSay why.\n`,
      },
    ],
  });
  const agentId = await upload({
    name: agent,
    type: "agent",
    files: [
      {
        path: "ronne.yaml",
        encoding: "utf8",
        content: `name: "${agent}"\ntype: agent\ndescription: Releases with care.\nagent:\n  prompt: prompt.md\ndependencies:\n  "${skill}": "^1.0.0"\n`,
      },
      { path: "prompt.md", encoding: "utf8", content: "You release with care.\n" },
    ],
  });
  const submitted = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [agentId] },
  });
  expect(submitted.status()).toBe(200);

  await signIn(page, E2E_USERS.releaseModerator);
  for (const id of [skillId, agentId]) {
    await page.goto(`/reviews/${id}`);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Approve this submission?" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await expect(page.getByText("approved it")).toBeVisible();
  }

  // Only the agent is ticked: its skill comes with it, and goes first.
  await page.goto("/reviews?tab=release");
  await page.getByLabel(`Select ${agent} to release`).check();
  await page.getByRole("button", { name: "Release selected (1)" }).click();
  const dialog = page.getByRole("dialog", { name: "Release 2 items?" });
  const preview = dialog.getByRole("region", { name: "What would be released" });
  await expect(preview.getByRole("listitem").first()).toContainText(skill);
  await expect(preview.getByRole("listitem").first()).toContainText(`included for ${agent}`);
  await expect(preview.getByText("1.0.0 as latest")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Release 2 items" }).click();
  const done = page.getByRole("dialog", { name: "Released" });
  await expect(done.getByText("Published:", { exact: true })).toHaveCount(2);
  await done.getByRole("button", { name: "Done" }).click();

  // rmk installs the agent, with the skill it depends on.
  const home = mkdtempSync(join(tmpdir(), "rmk-release-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-release-project-"));
  mkdirSync(join(project, ".claude"));
  try {
    execFileSync("node", [BIN, "install", agent, "--target", "claude-code"], {
      cwd: project,
      env: { ...process.env, HOME: home, RMK_TOKEN: secret, RMK_REGISTRY: baseURL },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(readFileSync(join(project, ".claude/skills/rel-skill/SKILL.md"), "utf8")).toContain(
      "Say why.",
    );
    const lock = JSON.parse(readFileSync(join(project, "rmk.lock"), "utf8"));
    expect(lock.items[agent].dependencies[skill]).toBe("1.0.0");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
