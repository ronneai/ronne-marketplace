import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/** A token for the person, for the API and `rmk`. */
const tokenFor = async (request: APIRequestContext, email: string, name: string) => {
  const response = await request.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).token as string;
};

/** Two skill drafts that need each other, by the author: neither is submitted. */
export const uploadCycle = async (
  request: APIRequestContext,
  author: string,
  [first, second]: readonly [string, string],
) => {
  const headers = { authorization: `Bearer ${await tokenFor(request, author, `e2e ${first}`)}` };
  const upload = async (skill: string, needs: string) => {
    const description = `description: Works with ${needs}.\n`;
    const response = await request.post("/api/v1/drafts", {
      headers,
      data: {
        name: `@${E2E_SCOPE}/${skill}`,
        type: "skill",
        files: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@${E2E_SCOPE}/${skill}"\ntype: skill\n${description}dependencies:\n  "@${E2E_SCOPE}/${needs}": "^1.0.0"\n`,
          },
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: `---\nname: ${skill}\n${description}---\nUse ${needs} too.\n`,
          },
        ],
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  return { firstId: await upload(first, second), secondId: await upload(second, first) };
};

/**
 * Feature 112, on every screen: from the first draft's page, Submit offers the second, which it
 * needs and which needs it, and sends both. The signed-in page is the author's.
 */
export const submitTogether = async (page: Page, [first, second]: readonly [string, string]) => {
  const firstName = `@${E2E_SCOPE}/${first}`;
  const secondName = `@${E2E_SCOPE}/${second}`;
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit for review" });
  await expect(dialog.getByText("Goes with 1 of your drafts:")).toBeVisible();
  const member = dialog
    .getByRole("list", { name: `Drafts submitted with ${firstName}` })
    .getByRole("listitem");
  await expect(member.getByRole("link", { name: secondName })).toBeVisible();
  await expect(member.getByText("needs each other")).toBeVisible();
  await expect(member.getByText("ready", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Submit with 1 more draft" }).click();
  await expect(
    dialog.getByText(`Submitted ${firstName} for review, with ${secondName}.`),
  ).toBeVisible();
  // Closed in any way, the page shows it submitted.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
};

/** A moderator approves one submission from its review page. */
export const approve = async (moderator: Page, id: string) => {
  await moderator.goto(`/reviews/${id}`);
  await moderator.getByRole("button", { name: "Approve", exact: true }).click();
  await moderator
    .getByRole("dialog", { name: "Approve this submission?" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(moderator.getByText("approved it")).toBeVisible();
};

/** From the first's page, one Publish releases both at 1.0.0. The signed-in page is the author's. */
export const releaseTogether = async (page: Page, [first, second]: readonly [string, string]) => {
  const firstName = `@${E2E_SCOPE}/${first}`;
  const secondName = `@${E2E_SCOPE}/${second}`;
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`Publish ${firstName}`) });
  // The other one, with the version it will get.
  await expect(dialog.getByRole("list", { name: "Released with it" })).toHaveText(
    `${secondName} 1.0.0`,
  );
  await dialog.getByRole("button", { name: "Publish 1.0.0" }).click();
  await expect(
    dialog.getByText(`Published ${firstName} 1.0.0 as latest, with ${secondName} 1.0.0.`),
  ).toBeVisible();
};

/** `rmk install` of the first, for Claude Code, in a new project: both skills land, once each. */
export const installCycle = async (
  request: APIRequestContext,
  installer: string,
  [first, second]: readonly [string, string],
) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".claude"));
  try {
    const token = await tokenFor(request, installer, `e2e install ${first}`);
    const run = (...args: string[]) => {
      try {
        return execFileSync("node", [BIN, ...args], {
          cwd: project,
          env: { ...process.env, HOME: home, RMK_TOKEN: token, RMK_REGISTRY: baseURL },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const failed = error as { stdout: string; stderr: string };
        throw new Error(`rmk ${args.join(" ")} failed:\n${failed.stdout}${failed.stderr}`);
      }
    };
    run("install", `@${E2E_SCOPE}/${first}`, "--target", "claude-code");
    const read = (path: string) => readFileSync(join(project, path), "utf8");
    expect(read(`.claude/skills/${first}/SKILL.md`)).toContain(`Use ${second} too.`);
    expect(read(`.claude/skills/${second}/SKILL.md`)).toContain(`Use ${first} too.`);
    const lock = JSON.parse(read("rmk.lock")).items;
    expect(lock[`@${E2E_SCOPE}/${first}`].dependencies).toEqual({
      [`@${E2E_SCOPE}/${second}`]: "1.0.0",
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
};
