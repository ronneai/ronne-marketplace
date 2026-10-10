import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRegistry, type FakeIo, run } from "@ronneai/rmk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

let clock = Date.UTC(2026, 8, 29);
const start = async () => {
  const started = await startServer({ now: () => clock });
  io = started.io;
  mkdirSync(join(io.cwd, ".claude"));
  return started;
};
const read = (path: string) => readFileSync(join(io.cwd, path), "utf8");
const planIdOf = (data: Record<string, unknown>) => String(data.planId);

describe("usage (046)", () => {
  it("reports what apply_plan installed, under the registry's policy", async () => {
    const reports: unknown[] = [];
    const started = await startServer({
      routes: {
        "GET /usage": () => ({ json: { policy: "choice", retentionDays: 90 } }),
        "POST /usage": ({ body }) => {
          reports.push(body);
          return { status: 202, json: { accepted: 2, ignored: 0 } };
        },
      },
    });
    io = started.io;
    mkdirSync(join(io.cwd, ".claude"));
    const plan = await started.call("plan_install", { items: ["@team/secure"] });
    expect(reports).toEqual([]);
    await started.call("apply_plan", { planId: planIdOf(plan.data) });
    expect(reports).toEqual([
      {
        events: [
          expect.objectContaining({ item: "@team/gh", event: "install", tool: "claude-code" }),
          expect.objectContaining({ item: "@team/secure", event: "install", tool: "claude-code" }),
        ],
      },
    ]);
  });
});

describe("plans", () => {
  it("plans an install without writing anything, then applies exactly that", async () => {
    const { call } = await start();
    const plan = await call("plan_install", { items: ["@team/secure"] });
    expect(plan.isError).toBe(false);
    expect(readdirSync(io.cwd)).toEqual([".claude"]);
    expect(readdirSync(join(io.cwd, ".claude"))).toEqual([]);
    expect(plan.text).toContain("Plan to install @team/secure for claude-code:");
    expect(plan.text).toContain("  @team/gh@1.2.0 (new)\n  @team/secure@1.1.0 (new)");
    expect(plan.text).toContain("  .claude/skills/secure (@team/secure)");
    expect(plan.text).toContain("  .mcp.json (mcpServers.gh) (@team/gh)");
    expect(plan.text).toContain(
      "What @team/gh@1.2.0 can do: It starts the program `npx` on your machine.",
    );
    expect(plan.text).toContain("not set here: GITHUB_TOKEN.");
    expect(plan.text).toContain(`call apply_plan with planId "${planIdOf(plan.data)}"`);
    expect(plan.data).toMatchObject({ kind: "install", targets: ["claude-code"], conflicts: [] });

    const applied = await call("apply_plan", { planId: planIdOf(plan.data) });
    expect(applied.isError).toBe(false);
    expect(applied.text).toContain("Installed @team/gh@1.2.0, @team/secure@1.1.0 for claude-code.");
    expect(read(".claude/skills/secure/SKILL.md")).toContain("Check inputs and secrets.");
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({ "@team/secure": "latest" });
    expect(JSON.parse(read("rmk.lock")).items["@team/secure"].version).toBe("1.1.0");
    // Applied once: the same plan can't be applied again.
    expect((await call("apply_plan", { planId: planIdOf(plan.data) })).data).toMatchObject({
      error: { code: "plan_expired" },
    });
    expect((await call("plan_install", { items: [] })).text).toContain(
      "Nothing would change on disk.",
    );
  });

  it("refuses a plan after ten minutes", async () => {
    const { call } = await start();
    const plan = await call("plan_install", { items: ["@team/secure"] });
    clock += 10 * 60 * 1000 + 1;
    expect((await call("apply_plan", { planId: planIdOf(plan.data) })).data).toMatchObject({
      error: { code: "plan_expired" },
    });
    expect(existsSync(join(io.cwd, "rmk.lock"))).toBe(false);
  });

  it("refuses a plan whose files changed since, such as another install", async () => {
    const { call } = await start();
    const plan = await call("plan_install", { items: ["@team/secure"] });
    // Another client, or rmk at the terminal, gets there first.
    await run(["install", "@team/gh", "--target", "claude-code"], io);
    const stale = await call("apply_plan", { planId: planIdOf(plan.data) });
    expect(stale.isError).toBe(true);
    expect(stale.data).toMatchObject({ error: { code: "plan_stale" } });
    expect(existsSync(join(io.cwd, ".claude/skills/secure"))).toBe(false);
  });

  it("shows conflicts, and refuses to apply them: no --force over MCP", async () => {
    const { call } = await start();
    mkdirSync(join(io.cwd, ".claude/skills/secure"), { recursive: true });
    writeFileSync(join(io.cwd, ".claude/skills/secure/SKILL.md"), "mine\n");
    const plan = await call("plan_install", { items: ["@team/secure"] });
    expect(plan.text).toContain("This plan can't be applied");
    expect(plan.text).toContain("  .claude/skills/secure: not written by rmk (@team/secure)");
    const refused = await call("apply_plan", { planId: planIdOf(plan.data) });
    expect(refused.data).toMatchObject({ error: { code: "conflicts" } });
    expect(read(".claude/skills/secure/SKILL.md")).toBe("mine\n");
  });

  it("plans updates and removals the same way", async () => {
    const { call } = await start();
    const install = await call("plan_install", { items: ["@team/secure"] });
    await call("apply_plan", { planId: planIdOf(install.data) });
    const update = await call("plan_update", {});
    expect(update.text).toContain("Plan to update for claude-code:");
    expect(update.text).toContain("Nothing would change on disk.");
    const removal = await call("plan_remove", { items: ["@team/secure"] });
    expect(removal.text).toContain("  removed: @team/gh, @team/secure");
    expect(removal.text).toContain("Would remove:");
    expect(existsSync(join(io.cwd, ".claude/skills/secure"))).toBe(true);
    const removed = await call("apply_plan", { planId: planIdOf(removal.data) });
    expect(removed.isError).toBe(false);
    expect(existsSync(join(io.cwd, ".claude/skills/secure"))).toBe(false);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({});
  });

  it("asks for targets when the folder looks like several tools, and passes them on", async () => {
    const { call } = await start();
    mkdirSync(join(io.cwd, ".codex"));
    const unsure = await call("plan_install", { items: ["@team/secure"] });
    expect(unsure.data).toMatchObject({ error: { code: "no_target" } });
    expect(unsure.text).toContain('Pass targets, such as ["claude-code"].');
    const both = await call("plan_install", { items: ["@team/secure"], targets: ["codex"] });
    expect(both.text).toContain("for codex:");
    expect(both.text).toContain(".codex/config.toml (mcp_servers.gh)");
  });
});

describe("an item whose name changed (118)", () => {
  it("plans the move to the new name, and applying it rewrites the project", async () => {
    const { packed } = await buildRegistry();
    const fmt = packed["@team/fmt@1.0.0"];
    let moved = false;
    const item = { version: "1.0.0", type: "hook", sha256: fmt.sha256, dependencies: {} };
    const started = await startServer({
      routes: {
        "POST /resolve": () => ({
          json: moved
            ? {
                items: { "@acme/team/fmt": item },
                warnings: [],
                renamed: { "@team/fmt": "@acme/team/fmt" },
              }
            : { items: { "@team/fmt": item }, warnings: [], renamed: {} },
        }),
        "GET /items/team/fmt/1.0.0": () => ({ json: { version: "1.0.0", riskFlags: [] } }),
        "GET /workspaces/acme/items/team/fmt/1.0.0/tarball": () => ({
          bytes: fmt.tgz,
          headers: { "x-checksum-sha256": fmt.sha256 },
        }),
      },
    });
    io = started.io;
    mkdirSync(join(io.cwd, ".claude"));
    const first = await started.call("plan_install", { items: ["@team/fmt"] });
    await started.call("apply_plan", { planId: planIdOf(first.data) });
    moved = true;
    const plan = await started.call("plan_install", { items: [] });
    expect(plan.text).toContain(
      "Note: @team/fmt is now @acme/team/fmt; the project would use the new name from now on.",
    );
    expect(plan.data).toMatchObject({ renamed: [{ from: "@team/fmt", to: "@acme/team/fmt" }] });
    await started.call("apply_plan", { planId: planIdOf(plan.data) });
    expect(Object.keys(JSON.parse(read("rmk.lock")).items)).toEqual(["@acme/team/fmt"]);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({
      "@acme/team/fmt": "latest",
    });
  });
});
