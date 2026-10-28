import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { fits, noSideScroll } from "./move-scope";
import { E2E_ITEM_MOVE, E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

/** The item's page in the project's workspace, in its first scope or the one it moved to. */
export const itemMovePath = (project: string, scope: string = E2E_ITEM_MOVE.from) =>
  `/workspaces/${E2E_ITEM_MOVE.workspace(project)}/items/${scope}/${E2E_ITEM_MOVE.item}`;

/** The item's full name in the project's workspace. */
export const itemMoveName = (project: string, scope: string = E2E_ITEM_MOVE.from) =>
  `@${E2E_ITEM_MOVE.workspace(project)}/${scope}/${E2E_ITEM_MOVE.item}`;

/**
 * The Move dialog on a screen (134, task 6), moving nothing: the member's form (a request, with a
 * message and who answers), then the moderator's confirmation. Each fits its screen at its own
 * width, 360px and 320px, and nothing in it scrolls sideways.
 */
export const moveItemDialogFits = async (member: Page, moderator: Page, project: string) => {
  const name = itemMoveName(project);
  await member.goto(itemMovePath(project));
  await member.getByRole("button", { name: "Move to another scope…" }).click();
  const ask = member.getByRole("dialog", { name: `Move ${name}` });
  await ask.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
  await expect(ask.getByText(itemMoveName(project, E2E_ITEM_MOVE.to))).toBeVisible();
  await expect(ask.getByLabel("Message (optional)")).toBeVisible();
  await expect(ask.getByRole("button", { name: "Ask to move" })).toBeEnabled();
  await fits(member, "the Move dialog, asking");
  await noSideScroll(member, ask, "the Move dialog, asking");
  await ask.getByRole("button", { name: "Cancel" }).click();

  await moderator.goto(itemMovePath(project));
  await moderator.getByRole("button", { name: "Move to another scope…" }).click();
  const move = moderator.getByRole("dialog", { name: `Move ${name}` });
  await move.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
  await move.getByRole("button", { name: "Move item" }).click();
  await expect(move.getByRole("button", { name: "Back" })).toBeVisible();
  await fits(moderator, "the Move dialog's confirmation");
  await noSideScroll(moderator, move, "the Move dialog's confirmation");
  await move.getByRole("button", { name: "Back" }).click();
  await move.getByRole("button", { name: "Cancel" }).click();
  // Nothing moved: the item is still where it was.
  await expect(moderator).toHaveURL(new RegExp(`${itemMovePath(project)}$`));
};

/**
 * The Item moves table on a screen (134, task 7): the member asks, the moderator sees the row on
 * the Requests page, which fits its screen, and declines it with a reason the member then sees on
 * the item's page. Nothing moves, and no request stays open.
 */
export const itemMovesTableFits = async (member: Page, moderator: Page, project: string) => {
  const name = itemMoveName(project);
  const to = `@${E2E_ITEM_MOVE.workspace(project)}/${E2E_ITEM_MOVE.to}`;
  await member.goto(itemMovePath(project));
  await member.getByRole("button", { name: "Move to another scope…" }).click();
  const ask = member.getByRole("dialog", { name: `Move ${name}` });
  await ask.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
  await ask.getByLabel("Message (optional)").fill("It belongs with devops.");
  await ask.getByRole("button", { name: "Ask to move" }).click();
  await expect(ask.getByText(`Asked to move it to ${to}.`)).toBeVisible();
  await ask.getByRole("button", { name: "Done" }).click();
  await expect(member.getByText(`Moving to ${to}: waiting for an answer`)).toBeVisible();

  await moderator.goto("/workspaces/requests");
  await expect(moderator.getByRole("heading", { name: "Item moves" })).toBeVisible();
  await expect(moderator.getByText("It belongs with devops.")).toBeVisible();
  await fits(moderator, "the Requests page with an item move");
  await moderator.getByRole("button", { name: `Decline moving ${name} to ${to}` }).click();
  const decline = moderator.getByRole("dialog", { name: "Decline move" });
  await decline.getByLabel("Reason (optional)").fill("Keep it in infra.");
  await noSideScroll(moderator, decline, "the Decline dialog");
  await decline.getByRole("button", { name: "Decline" }).click();
  // Answered: the page refreshes, and the row (with its dialog) is gone.
  await expect(moderator.getByText("No item moves waiting.")).toBeVisible();

  await member.reload();
  await expect(member.getByText(`Move to ${to} declined`)).toBeVisible();
  await expect(member.getByText("“Keep it in infra.”")).toBeVisible();
};

const RMK = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));

/** `rmk` as `who`, in a new project with Claude Code, against the running instance. */
const rmkAs = async (request: APIRequestContext, who: keyof typeof E2E_USERS) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-move-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-move-project-"));
  mkdirSync(join(project, ".claude"));
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS[who], password: E2E_PASSWORD, name: "e2e item move" },
  });
  expect(token.status()).toBe(201);
  const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const run = (...args: string[]) =>
    execFileSync("node", [RMK, ...args], {
      cwd: project,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const lockfile = () =>
    Object.keys(JSON.parse(readFileSync(join(project, "rmk.lock"), "utf8")).items);
  const done = () => {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  };
  return { run, lockfile, done };
};

/**
 * Feature 134, end to end (task 9): the member installs the item with rmk and asks to move it;
 * the moderator approves it from the Requests page; the old page redirects to the new one, History
 * says who asked and who approved, rmk moves the project to the new name and a new project
 * installs by it. Then the moderator moves it back at once, after the confirmation.
 */
export const moveItemEndToEnd = async (
  member: Page,
  moderator: Page,
  project: string,
  request: APIRequestContext,
) => {
  const who = E2E_ITEM_MOVE.projects[project as keyof typeof E2E_ITEM_MOVE.projects];
  const oldName = itemMoveName(project);
  const newName = itemMoveName(project, E2E_ITEM_MOVE.to);
  const to = `@${E2E_ITEM_MOVE.workspace(project)}/${E2E_ITEM_MOVE.to}`;
  const rmk = await rmkAs(request, who.member);
  try {
    rmk.run("install", oldName, "--target", "claude-code");
    expect(rmk.lockfile()).toEqual([oldName]);

    // The member asks.
    await member.goto(itemMovePath(project));
    await member.getByRole("button", { name: "Move to another scope…" }).click();
    const ask = member.getByRole("dialog", { name: `Move ${oldName}` });
    await ask.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
    await ask.getByRole("button", { name: "Ask to move" }).click();
    await ask.getByRole("button", { name: "Done" }).click();

    // The moderator approves it from the Requests page.
    await moderator.goto("/workspaces/requests");
    await moderator.getByRole("button", { name: `Approve moving ${oldName} to ${to}` }).click();
    await expect(moderator.getByText("No item moves waiting.")).toBeVisible();

    // The old address goes to the item's page under its new name; History says who did what.
    await member.goto(itemMovePath(project));
    await expect(member).toHaveURL(new RegExp(`${itemMovePath(project, E2E_ITEM_MOVE.to)}$`));
    await expect(member.getByRole("heading", { name: newName })).toBeVisible();
    await member.getByRole("link", { name: "History", exact: true }).click();
    await expect(member.getByText("Moved to another scope")).toBeVisible();
    await expect(
      member.getByText(
        `asked by ${E2E_NAMES[who.member]}, approved by ${E2E_NAMES[who.moderator]}`,
      ),
    ).toBeVisible();

    // rmk moves the project to the new name; a new project installs by either name, the old one
    // answering with the new.
    rmk.run("update");
    expect(rmk.lockfile()).toEqual([newName]);
    for (const asked of [oldName, newName]) {
      const fresh = await rmkAs(request, who.member);
      try {
        const out = fresh.run("install", asked, "--target", "claude-code");
        if (asked === oldName) expect(out).toContain(`${oldName} is now ${newName}`);
        expect(fresh.lockfile()).toEqual([newName]);
      } finally {
        fresh.done();
      }
    }
  } finally {
    rmk.done();
  }

  // The moderator moves it back at once: Move item, the confirmation, then its page there.
  await moderator.goto(itemMovePath(project, E2E_ITEM_MOVE.to));
  await moderator.getByRole("button", { name: "Move to another scope…" }).click();
  const move = moderator.getByRole("dialog", { name: `Move ${newName}` });
  await move.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.from });
  await move.getByRole("button", { name: "Move item" }).click();
  await move.getByRole("button", { name: "Move item" }).click();
  await expect(move.getByText(`Moved. It’s ${oldName} now.`)).toBeVisible();
  await move.getByRole("button", { name: "Done" }).click();
  await expect(moderator).toHaveURL(new RegExp(`${itemMovePath(project)}$`));
  await expect(moderator.getByRole("heading", { name: oldName })).toBeVisible();
};
