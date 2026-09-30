import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FakeIo, run } from "@ronneai/rmk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const start = async (options: { login?: boolean } = {}) => {
  const started = await startServer(options);
  io = started.io;
  return started;
};

describe("the registry MCP server", () => {
  it("lists its tools, marking all but apply_plan and export_items read-only", async () => {
    const { client } = await start();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "search_items",
      "get_item",
      "list_installed",
      "check_outdated",
      "plan_install",
      "plan_update",
      "plan_remove",
      "apply_plan",
      "list_local_items",
      "plan_export",
      "export_items",
    ]);
    // Planning writes and sends nothing; apply_plan writes files and export_items uploads, so only
    // they need the person's approval.
    expect(tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name)).toEqual([
      "apply_plan",
      "export_items",
    ]);
    expect(tools.find((t) => t.name === "export_items")?.annotations).toMatchObject({
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(tools.find((t) => t.name === "list_local_items")?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(client.getServerVersion()?.name).toBe("ronne-registry");
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("Ask the person which scope to export to; never choose it.");
    expect(instructions).toContain("Drafts are never submitted from here");
  });

  it("searches and reads items as rmk does", async () => {
    const { call } = await start();
    const found = await call("search_items", { query: "team", tool: "codex" });
    expect(found.text).toBe((await run(["search", "team"], io)).stdout.trimEnd());
    expect(io.requests.find((r) => r.path.startsWith("/api/v1/items?"))?.path).toBe(
      "/api/v1/items?q=team&tool=codex",
    );
    expect((found.data.items as unknown[]).length).toBe(2);
    const item = await call("get_item", { name: "@team/secure" });
    expect(item.text).toBe((await run(["info", "@team/secure"], io)).stdout.trimEnd());
    expect(item.data).toMatchObject({ item: { name: "@team/secure" } });
  });

  it("lists what's installed and what's outdated, as rmk does", async () => {
    const { call } = await start();
    expect((await call("list_installed")).text).toBe("Nothing is installed here yet.");
    await run(["install", "@team/secure", "--target", "claude-code"], io);
    const installed = await call("list_installed");
    expect(installed.text).toBe(
      "@team/gh@1.2.0  mcp-server  (a dependency)\n@team/secure@1.1.0  skill",
    );
    const outdated = await call("check_outdated");
    expect(outdated.data.items).toEqual(
      JSON.parse((await run(["outdated", "--json"], io)).stdout).items,
    );
    expect(outdated.text).toBe("Everything is up to date.");
  });

  it("says to run rmk login without a token, and never shows the token", async () => {
    const { call } = await start({ login: false });
    for (const [tool, args] of [
      ["search_items", { query: "x" }],
      ["get_item", { name: "@team/secure" }],
      ["check_outdated", {}],
      ["plan_export", { items: ["mine"], to: "team" }],
      ["plan_export", { items: ["mine"] }],
      ["export_items", { planId: "any" }],
    ] as const) {
      const result = await call(tool, args);
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/No registry: run `rmk login|Run `rmk login`/);
    }
    // Listing what's here needs no registry.
    const listed = await call("list_local_items");
    expect(listed.isError).toBe(false);
    expect(listed.text).toContain("No skills found");
    io.cleanup();
    const logged = await start();
    const text = JSON.stringify(await logged.call("get_item", { name: "@team/secure" }));
    expect(text).not.toContain("rmk_test_token");
  });
});

describe("without the registry", () => {
  it("lists local items, and plan_export and export_items say it can't be reached", async () => {
    const { call } = await start();
    mkdirSync(join(io.cwd, ".claude/skills/mine"), { recursive: true });
    writeFileSync(
      join(io.cwd, ".claude/skills/mine/SKILL.md"),
      "---\nname: mine\ndescription: Mine.\n---\n",
    );
    io.fetch = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;
    const listed = await call("list_local_items");
    expect(listed.isError).toBe(false);
    expect(listed.data).toMatchObject({ items: [{ name: "mine", origin: "yours" }] });
    for (const [tool, args] of [
      ["plan_export", { items: ["mine"], to: "team" }],
      ["export_items", { planId: "any" }],
    ] as const) {
      const result = await call(tool, args);
      expect(result.isError, tool).toBe(true);
      if (tool === "plan_export")
        expect(result.data).toMatchObject({ error: { code: "unreachable" } });
    }
  });
});
