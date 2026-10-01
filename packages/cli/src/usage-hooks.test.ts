import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { writeUserConfig } from "./config.js";
import { queuedUsage, refreshPolicy, type UsagePolicy } from "./telemetry.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY } from "./testing.js";
import { addUsageHooks, HOOK_FILES, hookedTools, runHook, runOf } from "./usage-hooks.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const NOW = new Date("2026-10-05T12:00:00.000Z");
const TOKEN = "rmk_test_token";

/**
 * Claude Code 2.1.286's payloads, captured from real runs on 2026-09-30 (046 task 0), with ids and
 * paths replaced. Codex's and Cursor's follow the fields their hook docs list (2026-09-30).
 */
const CLAUDE = {
  skill: {
    session_id: "<id>",
    transcript_path: "<path>",
    cwd: "/work/project",
    permission_mode: "auto",
    hook_event_name: "PostToolUse",
    tool_name: "Skill",
    tool_input: { skill: "secure" },
    tool_response: { success: true, commandName: "secure" },
    tool_use_id: "<id>",
    duration_ms: 4,
  },
  typed: {
    session_id: "<id>",
    cwd: "/work/project",
    hook_event_name: "UserPromptExpansion",
    expansion_type: "slash_command",
    command_name: "review",
    command_args: "",
    command_source: "projectSettings",
    prompt: "/review",
  },
  agent: {
    session_id: "<id>",
    cwd: "/work/project",
    agent_id: "<id>",
    agent_type: "reviewer",
    hook_event_name: "SubagentStart",
  },
};

describe("runOf: each tool's events", () => {
  it("Claude Code: skills the model chose or the person typed, agents, MCP servers", () => {
    expect(runOf("claude-code", CLAUDE.skill)).toEqual({
      names: ["secure"],
      types: ["skill"],
      trigger: "model",
      outcome: "success",
    });
    expect(runOf("claude-code", { ...CLAUDE.skill, agent_id: "<id>" })?.trigger).toBe("agent");
    expect(
      runOf("claude-code", {
        ...CLAUDE.skill,
        hook_event_name: "PostToolUseFailure",
        is_interrupt: true,
      })?.outcome,
    ).toBe("cancelled");
    expect(
      runOf("claude-code", { ...CLAUDE.skill, hook_event_name: "PostToolUseFailure" })?.outcome,
    ).toBe("error");
    expect(runOf("claude-code", CLAUDE.typed)).toEqual({
      names: ["review"],
      types: ["skill", "command"],
      trigger: "user",
      outcome: "unknown",
    });
    expect(runOf("claude-code", CLAUDE.agent)).toEqual({
      names: ["reviewer"],
      types: ["agent"],
      trigger: "model",
      outcome: "unknown",
    });
    expect(
      runOf("claude-code", {
        cwd: "/work/project",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__gh__create_issue",
        tool_response: {},
      }),
    ).toEqual({ names: ["gh"], types: ["mcp-server"], trigger: "model", outcome: "success" });
  });

  it("Claude Code: ignores what isn't a run, MCP servers from plugins, and Cursor's copy", () => {
    expect(runOf("claude-code", { ...CLAUDE.skill, hook_event_name: "PreToolUse" })).toBeNull();
    expect(runOf("claude-code", { ...CLAUDE.typed, expansion_type: "mcp_prompt" })).toBeNull();
    expect(
      runOf("claude-code", { hook_event_name: "PostToolUse", tool_name: "mcp__plugin_x_gh__a" }),
    ).toBeNull();
    expect(runOf("claude-code", { hook_event_name: "PostToolUse", tool_name: "Bash" })).toBeNull();
    expect(runOf("claude-code", { ...CLAUDE.skill, cursor_version: "2.0" })).toBeNull();
  });

  it("Codex: agents and MCP servers, outcome unknown", () => {
    expect(
      runOf("codex", {
        session_id: "<id>",
        cwd: "/work/project",
        hook_event_name: "SubagentStart",
        agent_id: "<id>",
        agent_type: "reviewer",
      }),
    ).toEqual({ names: ["reviewer"], types: ["agent"], trigger: "model", outcome: "unknown" });
    expect(
      runOf("codex", { hook_event_name: "PostToolUse", tool_name: "mcp__gh__list", cwd: "/w" }),
    ).toEqual({ names: ["gh"], types: ["mcp-server"], trigger: "model", outcome: "unknown" });
    expect(runOf("codex", { hook_event_name: "PostToolUse", tool_name: "shell" })).toBeNull();
  });

  it("Cursor: agents with how they ended, and MCP servers", () => {
    const stop = (status: string) =>
      runOf("cursor", {
        hook_event_name: "subagentStop",
        subagent_type: "reviewer",
        status,
        workspace_roots: ["/work/project"],
      })?.outcome;
    expect(stop("completed")).toBe("success");
    expect(stop("error")).toBe("error");
    expect(stop("aborted")).toBe("cancelled");
    const mcp = (result_json: string) =>
      runOf("cursor", {
        hook_event_name: "afterMCPExecution",
        mcp_server_name: "gh",
        tool_name: "list",
        result_json,
      });
    expect(mcp('{"content":[]}')).toEqual({
      names: ["gh"],
      types: ["mcp-server"],
      trigger: "model",
      outcome: "success",
    });
    expect(mcp('{"isError":true}')?.outcome).toBe("error");
  });
});

/** A registry with a policy, rmk logged in to it, and a project with installed items. */
const setUp = async (
  policy: UsagePolicy,
  items: Record<string, { version: string; type: string }>,
) => {
  io?.cleanup();
  io = fakeIo({
    ...identityRoutes(TOKEN),
    "GET /usage": () => ({ json: { policy, retentionDays: 90 } }),
  });
  io.now = () => NOW;
  writeUserConfig(io, {
    version: 1,
    defaultRegistry: REGISTRY,
    registries: { [REGISTRY]: { token: TOKEN, email: "dev@example.com" } },
  });
  await refreshPolicy(io, REGISTRY, TOKEN, { force: true });
  writeFileSync(
    join(io.cwd, "rmk.lock"),
    JSON.stringify({
      version: 1,
      registry: REGISTRY,
      items: Object.fromEntries(
        Object.entries(items).map(([name, item]) => [name, { ...item, sha256: "a" }]),
      ),
    }),
  );
  const sent: number[] = [];
  io.sendInBackground = () => sent.push(1);
  return sent;
};

const hook = async (tool: string, payload: unknown) => {
  io.readStdin = async () => (typeof payload === "string" ? payload : JSON.stringify(payload));
  return run(["telemetry", "hook", tool], io);
};

describe("rmk telemetry hook", () => {
  it("queues a run of an item rmk installed, in a subfolder too, and starts a send", async () => {
    const sent = await setUp("choice", { "@team/secure": { version: "1.1.0", type: "skill" } });
    mkdirSync(join(io.cwd, "src"));
    const result = await hook("claude-code", { ...CLAUDE.skill, cwd: join(io.cwd, "src") });
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(queuedUsage(io)[0]?.events).toEqual([
      {
        day: "2026-10-05",
        item: "@team/secure",
        version: "1.1.0",
        tool: "claude-code",
        event: "run",
        trigger: "model",
        outcome: "success",
        count: 1,
      },
    ]);
    expect(sent).toEqual([1]);
  });

  it("says ci for a run under CI", async () => {
    await setUp("required", { "@team/secure": { version: "1.1.0", type: "skill" } });
    io.env.CI = "true";
    io.readStdin = async () => JSON.stringify({ ...CLAUDE.skill, cwd: io.cwd });
    await runHook(io, "claude-code");
    expect(queuedUsage(io)[0]?.events[0]?.trigger).toBe("ci");
  });

  it("ignores items rmk didn't install, names that match two items, and reporting that's off", async () => {
    await setUp("choice", {
      "@team/review": { version: "1.0.0", type: "command" },
      "@other/review": { version: "2.0.0", type: "skill" },
    });
    await hook("claude-code", { ...CLAUDE.skill, cwd: io.cwd, tool_input: { skill: "unknown" } });
    await hook("claude-code", { ...CLAUDE.typed, cwd: io.cwd });
    expect(queuedUsage(io)).toEqual([]);

    await setUp("off", { "@team/secure": { version: "1.1.0", type: "skill" } });
    await hook("claude-code", { ...CLAUDE.skill, cwd: io.cwd });
    expect(queuedUsage(io)).toEqual([]);
  });

  it("prints nothing and exits 0 whatever it's given", async () => {
    await setUp("choice", {});
    for (const [tool, input] of [
      ["claude-code", "not json"],
      ["claude-code", "[]"],
      ["notepad", "{}"],
      ["cursor", '{"hook_event_name":"stop"}'],
    ] as const)
      expect(await hook(tool, input)).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });
});

/** A folder on PATH with an `rmk` in it, as a global install leaves. */
const rmkOnPath = () => {
  const bin = join(io.home, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "rmk"), "#!/bin/sh\n");
  chmodSync(join(bin, "rmk"), 0o755);
  io.env.PATH = bin;
};

describe("adding and removing the hooks", () => {
  it("adds them once per tool when reporting is on, in the user's settings, and says so", async () => {
    await setUp("choice", {});
    rmkOnPath();
    const lines = await addUsageHooks(io, {
      registry: REGISTRY,
      targets: ["claude-code", "codex"],
    });
    expect(lines).toEqual([
      "Added rmk's usage hook to ~/.claude/settings.json, to count runs of the items rmk installed.",
      "Added rmk's usage hook to ~/.codex/hooks.json, to count runs of the items rmk installed.",
      "Codex runs a new hook only after you review it: open /hooks in Codex.",
    ]);
    const settings = JSON.parse(readFileSync(join(io.home, HOOK_FILES["claude-code"]), "utf8"));
    expect(settings.hooks.PostToolUse).toEqual([
      {
        matcher: "Skill|mcp__.*",
        hooks: [{ type: "command", command: "rmk telemetry hook claude-code", async: true }],
      },
    ]);
    expect(Object.keys(settings.hooks).sort()).toEqual([
      "PostToolUse",
      "PostToolUseFailure",
      "SubagentStart",
      "UserPromptExpansion",
    ]);
    expect(hookedTools(io)).toEqual(["claude-code", "codex"]);
    // Already there: nothing to add, nothing to say.
    expect(await addUsageHooks(io, { registry: REGISTRY, targets: ["claude-code"] })).toEqual([]);
    expect(await addUsageHooks(io, { registry: REGISTRY, targets: ["cursor"] })).toEqual([
      "Added rmk's usage hook to ~/.cursor/hooks.json, to count runs of the items rmk installed.",
    ]);
    expect(JSON.parse(readFileSync(join(io.home, HOOK_FILES.cursor), "utf8"))).toEqual({
      version: 1,
      hooks: {
        afterMCPExecution: [{ command: "rmk telemetry hook cursor" }],
        subagentStop: [{ command: "rmk telemetry hook cursor" }],
      },
    });
  });

  it("adds nothing where reporting is off, and says why when rmk isn't on PATH", async () => {
    await setUp("off", {});
    rmkOnPath();
    expect(await addUsageHooks(io, { registry: REGISTRY, targets: ["claude-code"] })).toEqual([]);
    await setUp("choice", {});
    expect(await addUsageHooks(io, { registry: REGISTRY, targets: ["claude-code"] })).toEqual([
      expect.stringContaining("rmk isn't on PATH"),
    ]);
    expect(hookedTools(io)).toEqual([]);
  });

  it("rmk telemetry off removes them where people choose, leaving one the person edited", async () => {
    await setUp("choice", {});
    rmkOnPath();
    await addUsageHooks(io, { registry: REGISTRY, targets: ["claude-code", "cursor"] });
    // An edited hook is the person's own now: rmk finds its entries by their exact content.
    const cursor = join(io.home, HOOK_FILES.cursor);
    const edited = JSON.parse(readFileSync(cursor, "utf8"));
    edited.hooks.subagentStop[0].timeout = 5;
    writeFileSync(cursor, JSON.stringify(edited));
    const off = await run(["telemetry", "off"], io);
    expect(off.stdout).toContain("Removed rmk's usage hook from ~/.claude/settings.json.");
    expect(hookedTools(io)).toEqual([]);
    expect(JSON.parse(readFileSync(join(io.home, HOOK_FILES["claude-code"]), "utf8"))).toEqual({});
    expect(JSON.parse(readFileSync(cursor, "utf8")).hooks.subagentStop).toEqual([
      { command: "rmk telemetry hook cursor", timeout: 5 },
    ]);
  });

  it("keeps them where usage is required", async () => {
    await setUp("required", {});
    rmkOnPath();
    await addUsageHooks(io, { registry: REGISTRY, targets: ["claude-code"] });
    await run(["telemetry", "off"], io);
    expect(hookedTools(io)).toEqual(["claude-code"]);
  });
});
