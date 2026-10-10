import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SHELF, E2E_USERS, E2E_VAULT } from "./users";

const RMK = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const MCP = fileURLToPath(new URL("../../../packages/mcp/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/** "Private · @acme/scope/name", with the comma only a screen reader hears (093, 118). */
const lockLabel = (item: string) => new RegExp(`Private · (, )?${item.replaceAll("/", "\\/")}`);
// Its full name names its workspace (118).
const VAULT_ITEM = `@${E2E_VAULT.workspace}/${E2E_VAULT.scope}/${E2E_VAULT.item}`;
const vaultPage = `/workspaces/${E2E_VAULT.workspace}/items/${E2E_VAULT.scope}/${E2E_VAULT.item}`;
const unknownPage = `/items/${E2E_VAULT.scope}/nothing-here`;
const shelfPage = `/workspaces/${E2E_SHELF.workspace}/items/${E2E_SHELF.scope}/${E2E_SHELF.item}`;

const signedIn = async (browser: Browser, email: string): Promise<Page> => {
  const page = await browser.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
};

/** What a page says, with a name masked: a private item's must read as an unknown one's. */
const pageText = async (page: Page, path: string, name: string) => {
  const response = await page.goto(path);
  const text = (await page.locator("main").innerText()).replaceAll(name, "X");
  return `${response?.status()} ${text}`;
};

/**
 * Private workspaces (093) for two people: a member of e2e-vault sees its skill with a lock label,
 * in the catalogue, its Workspace filter and the item page; someone who isn't gets exactly what an
 * unknown name gets.
 */
test("a member sees a private workspace's item with its lock; an outsider gets an unknown name", async ({
  browser,
}) => {
  const member = await signedIn(browser, E2E_USERS.privateMember);
  await member.goto(`/catalogue?q=${E2E_VAULT.item}`);
  const card = member.getByRole("article").filter({ hasText: VAULT_ITEM });
  await expect(card).toContainText(lockLabel(VAULT_ITEM));
  await expect(card.locator("svg.lucide-lock")).toBeVisible();
  await expect(member.locator("#catalogue-workspace option")).toContainText([E2E_VAULT.workspace]);
  await member.goto(vaultPage);
  await expect(member.getByRole("heading", { level: 1 })).toHaveText(lockLabel(VAULT_ITEM));

  const outsider = await signedIn(browser, E2E_USERS.privateOutsider);
  await outsider.goto(`/catalogue?q=${E2E_VAULT.item}`);
  await expect(outsider.getByRole("article").filter({ hasText: VAULT_ITEM })).toHaveCount(0);
  await outsider.goto("/catalogue");
  await expect(
    outsider.locator(`#catalogue-workspace option[value="${E2E_VAULT.workspace}"]`),
  ).toHaveCount(0);
  const hidden = await pageText(outsider, vaultPage, E2E_VAULT.item);
  expect(hidden).toMatch(/^404 /);
  expect(hidden).toBe(await pageText(outsider, unknownPage, "nothing-here"));
});

type Reply = { id?: number; result?: Record<string, unknown> };

/** A minimal MCP client over stdio, as mcp.e2e.ts drives the real rmk-mcp. */
const mcpClient = (server: ChildProcessWithoutNullStreams) => {
  const waiting = new Map<number, (reply: Reply) => void>();
  createInterface({ input: server.stdout }).on("line", (line) => {
    const reply = JSON.parse(line) as Reply;
    if (reply.id !== undefined) waiting.get(reply.id)?.(reply);
  });
  let next = 1;
  const request = (method: string, params: Record<string, unknown> = {}) => {
    const id = next++;
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise<Reply>((resolve) => waiting.set(id, resolve));
  };
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = await request("tools/call", { name, arguments: args });
    const result = reply.result as { content: { text: string }[]; isError?: boolean };
    return { text: result.content.map((c) => c.text).join("\n"), isError: result.isError === true };
  };
  return {
    request,
    call,
    notify: (method: string) =>
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`),
  };
};

/** Runs `work` with rmk-mcp started for `email`, in its own home and project folders. */
const withMcp = async (
  request: APIRequestContext,
  email: string,
  work: (client: ReturnType<typeof mcpClient>) => Promise<void>,
) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  const token = await request.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name: "e2e private rmk-mcp" },
  });
  expect(token.status()).toBe(201);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  execFileSync(
    "node",
    [RMK, "login", "--registry", baseURL, "--token", (await token.json()).token],
    {
      cwd: project,
      env,
      encoding: "utf8",
    },
  );
  const server = spawn("node", [MCP], { cwd: project, env });
  try {
    const client = mcpClient(server);
    await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0" },
    });
    client.notify("notifications/initialized");
    await work(client);
  } finally {
    server.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
};

/** The MCP read tools read through the registry API, as the person whose token it is (093). */
test("rmk-mcp shows a private item to a member and an unknown name to an outsider", async ({
  request,
}) => {
  await withMcp(request, E2E_USERS.privateMember, async (client) => {
    const found = await client.call("search_items", { query: E2E_VAULT.item });
    expect(found.text).toContain(`${VAULT_ITEM}@1.0.0  skill`);
    const item = await client.call("get_item", { name: VAULT_ITEM });
    expect(item.isError, item.text).toBe(false);
    expect(item.text).toContain(VAULT_ITEM);
  });
  await withMcp(request, E2E_USERS.privateOutsider, async (client) => {
    const found = await client.call("search_items", { query: E2E_VAULT.item });
    expect(found.text).not.toContain(VAULT_ITEM);
    const hidden = await client.call("get_item", { name: VAULT_ITEM });
    const unknown = await client.call("get_item", {
      name: `@${E2E_VAULT.workspace}/${E2E_VAULT.scope}/nothing-here`,
    });
    expect(hidden.isError).toBe(true);
    expect(hidden.text.replaceAll(E2E_VAULT.item, "X")).toBe(
      unknown.text.replaceAll("nothing-here", "X"),
    );
  });
});

/**
 * Root's Make private and Make public (093) on e2e-shelf's page: the dialog, then what an outsider
 * sees on the next request, and back.
 */
test("root makes a workspace private and public again, and an outsider sees it go and come back", async ({
  browser,
}) => {
  const root = await signedIn(browser, E2E_USERS.privateRoot);
  const outsider = await signedIn(browser, E2E_USERS.privateOutsider);
  expect((await outsider.goto(shelfPage))?.status()).toBe(200);

  await root.goto(`/admin/workspaces/${E2E_SHELF.workspace}`);
  await root.getByRole("button", { name: "Make private" }).click();
  const dialog = root.getByRole("dialog", { name: "Make private" });
  await expect(dialog).toContainText(
    `Make ${E2E_SHELF.workspace} private? Only its members and root will see its items`,
  );
  await dialog.getByRole("button", { name: "Make private" }).click();
  await expect(dialog).toContainText("It's private: only its members and root see its items.");
  await dialog.getByRole("button", { name: "Done" }).click();

  expect((await outsider.goto(shelfPage))?.status()).toBe(404);
  await root.goto(shelfPage);
  await expect(root.getByRole("heading", { level: 1 })).toContainText(
    lockLabel(`@${E2E_SHELF.workspace}/${E2E_SHELF.scope}/${E2E_SHELF.item}`),
  );

  await root.goto(`/admin/workspaces/${E2E_SHELF.workspace}`);
  await root.getByRole("button", { name: "Make public" }).click();
  const back = root.getByRole("dialog", { name: "Make public" });
  await expect(back).toContainText(`Make ${E2E_SHELF.workspace} public?`);
  await back.getByRole("button", { name: "Make public" }).click();
  await expect(back).toContainText("It's public: everyone signed in sees its items.");

  expect((await outsider.goto(shelfPage))?.status()).toBe(200);
  await expect(outsider.getByRole("heading", { level: 1 })).not.toContainText("Private");
});
