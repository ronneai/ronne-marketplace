import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_PROPOSAL_ITEM, E2E_RMK_ITEMS, E2E_SCOPE, E2E_USERS } from "./users";

const RMK = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const MCP = fileURLToPath(new URL("../../../packages/mcp/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").baseURL;

type Reply = { id?: number; result?: Record<string, unknown>; error?: { message: string } };

/** A minimal MCP client over stdio: newline-delimited JSON-RPC, as the protocol defines it. */
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
  const notify = (method: string) =>
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await request("tools/call", { name, arguments: args });
    const result = reply.result as {
      content: { text: string }[];
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    };
    return {
      text: result.content.map((c) => c.text).join("\n"),
      data: result.structuredContent ?? {},
      isError: result.isError === true,
    };
  };
  return { request, notify, call };
};

/**
 * The registry MCP server (feature 027), built and started over stdio as an AI tool would, in a
 * project folder, against the running instance: search, plan, apply, and a stale plan refused.
 */
test("rmk-mcp searches, plans and applies an install, and refuses a stale plan", async ({
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".claude"));
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.installer, password: E2E_PASSWORD, name: "e2e rmk-mcp" },
  });
  expect(token.status()).toBe(201);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  const rmk = (...args: string[]) =>
    execFileSync("node", [RMK, ...args], { cwd: project, env, encoding: "utf8" });
  rmk("login", "--registry", baseURL, "--token", (await token.json()).token);
  const server = spawn("node", [MCP], { cwd: project, env });
  const name = (item: string) => `@${E2E_SCOPE}/${item}`;

  try {
    const client = mcpClient(server);
    const init = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0" },
    });
    expect(init.result?.serverInfo).toMatchObject({ name: "ronne-registry" });
    client.notify("notifications/initialized");
    const tools = (await client.request("tools/list")).result?.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toContain("apply_plan");

    const found = await client.call("search_items", { query: E2E_RMK_ITEMS.agent });
    expect(found.text).toContain(`${name(E2E_RMK_ITEMS.agent)}@1.0.0  agent`);

    // Planning writes nothing to the project.
    const plan = await client.call("plan_install", { items: [name(E2E_RMK_ITEMS.agent)] });
    expect(plan.isError, plan.text).toBe(false);
    expect(plan.text).toContain(`.claude/agents/${E2E_RMK_ITEMS.agent}.md`);
    expect(existsSync(join(project, `.claude/agents/${E2E_RMK_ITEMS.agent}.md`))).toBe(false);
    const applied = await client.call("apply_plan", { planId: plan.data.planId });
    expect(applied.isError, applied.text).toBe(false);
    expect(existsSync(join(project, `.claude/agents/${E2E_RMK_ITEMS.agent}.md`))).toBe(true);
    expect(existsSync(join(project, `.claude/skills/${E2E_PROPOSAL_ITEM}/SKILL.md`))).toBe(true);
    expect((await client.call("list_installed")).text).toContain(name(E2E_RMK_ITEMS.agent));

    // rmk at the terminal gets there first: the plan made before it is stale.
    const later = await client.call("plan_install", { items: [name(E2E_RMK_ITEMS.hook)] });
    rmk("install", name(E2E_RMK_ITEMS.rule), "--target", "claude-code");
    const stale = await client.call("apply_plan", { planId: later.data.planId });
    expect(stale.isError).toBe(true);
    expect(stale.data).toMatchObject({ error: { code: "plan_stale" } });
  } finally {
    server.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
