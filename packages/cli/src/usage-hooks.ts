import { existsSync, mkdirSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { shortItemName } from "@ronneai/core";
import type { Change } from "@ronneai/core/render";
import { applyPlan, planChanges, readState, type Wanted, writeState } from "./apply.js";
import { configDir } from "./config.js";
import { type Io, nowOf } from "./io.js";
import { LOCK_FILE, readLockfile } from "./project.js";
import { dayOf, lastSendAttempt, queueUsage, reportingTo } from "./telemetry.js";

/**
 * The run hooks (feature 046): one `rmk`-managed hook in each AI tool's user-level settings, never
 * a project's, that counts runs of the items rmk installed. `rmk install` adds them when reporting
 * is on; `rmk telemetry off` removes them where the policy allows. They're recorded in the user
 * state file under `rmk telemetry`, like `rmk mcp-setup`'s entries, so installs leave them alone.
 * Which events each tool has was checked against the vendors' docs, and Claude Code's against
 * real payloads, on 2026-09-30.
 */
export const TELEMETRY_ITEM = "rmk telemetry";

/** The tools rmk can count runs in. */
export const HOOK_TOOLS = ["claude-code", "codex", "cursor"] as const;
export type HookTool = (typeof HOOK_TOOLS)[number];

const isHookTool = (value: string): value is HookTool =>
  (HOOK_TOOLS as readonly string[]).includes(value);

/** The file each tool's user-level hooks live in, relative to the home folder. */
export const HOOK_FILES: Record<HookTool, string> = {
  "claude-code": ".claude/settings.json",
  codex: ".codex/hooks.json",
  cursor: ".cursor/hooks.json",
};

const commandFor = (tool: HookTool) => `rmk telemetry hook ${tool}`;

/** The hook entries for one tool, as changes under the home folder. */
export const hookChanges = (tool: HookTool): Change[] => {
  const command = commandFor(tool);
  const path = HOOK_FILES[tool];
  if (tool === "claude-code") {
    // Async, so a run never waits for rmk. `Skill` is a skill the model chose; `mcp__…` an MCP tool.
    const handler = { type: "command", command, async: true };
    return [
      {
        kind: "json-array-item",
        path,
        key: ["hooks", "PostToolUse"],
        item: { matcher: "Skill|mcp__.*", hooks: [handler] },
      },
      {
        kind: "json-array-item",
        path,
        key: ["hooks", "PostToolUseFailure"],
        item: { matcher: "Skill|mcp__.*", hooks: [handler] },
      },
      {
        kind: "json-array-item",
        path,
        key: ["hooks", "UserPromptExpansion"],
        item: { hooks: [handler] },
      },
      {
        kind: "json-array-item",
        path,
        key: ["hooks", "SubagentStart"],
        item: { hooks: [handler] },
      },
    ];
  }
  if (tool === "codex") {
    const handler = { type: "command", command, async: true };
    return [
      {
        kind: "json-array-item",
        path,
        key: ["hooks", "SubagentStart"],
        item: { hooks: [handler] },
      },
      { kind: "json-array-item", path, key: ["hooks", "PostToolUse"], item: { hooks: [handler] } },
    ];
  }
  return [
    { kind: "json-key", path, key: ["version"], value: 1 },
    { kind: "json-array-item", path, key: ["hooks", "subagentStop"], item: { command } },
    { kind: "json-array-item", path, key: ["hooks", "afterMCPExecution"], item: { command } },
  ];
};

/** Whether a command name resolves on PATH, as the tool will run it. Nothing is run. */
export const onPath = (io: Io, name: string): boolean => {
  const exts =
    process.platform === "win32" ? (io.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (io.env.PATH ?? "").split(delimiter).filter(Boolean))
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return true;
      } catch {
        // An unreadable folder on PATH: keep looking.
      }
    }
  return false;
};

/** The user scope's state file and lockfile (as `places(io, "user")` in install.ts says). */
const userFiles = (io: Io) => ({
  state: join(configDir(io), "user-state.json"),
  lockDir: configDir(io),
  lockFile: "user.lock",
});

const ownState = (io: Io) => {
  const statePath = userFiles(io).state;
  const all = readState(statePath);
  return {
    statePath,
    own: { version: 1 as const, entries: all.entries.filter((e) => e.item === TELEMETRY_ITEM) },
    others: all.entries.filter((e) => e.item !== TELEMETRY_ITEM),
  };
};

/** The tools rmk's usage hook is installed in now. */
export const hookedTools = (io: Io): HookTool[] =>
  [...new Set(ownState(io).own.entries.flatMap((e) => e.targets))].filter(isHookTool).sort();

/** Plans and writes the hooks for exactly `tools`; returns the files written, or why not. */
const writeHooks = async (
  io: Io,
  tools: readonly HookTool[],
  force: boolean,
): Promise<{ written: string[]; removed: string[]; conflicts: string[] }> => {
  const { statePath, own, others } = ownState(io);
  const wanted: Wanted[] = tools.flatMap((tool) =>
    hookChanges(tool).map((change) => ({
      item: TELEMETRY_ITEM,
      version: "1",
      targets: [tool],
      change,
    })),
  );
  const plan = await planChanges(io.home, own, wanted, { force });
  if (plan.conflicts.length)
    return { written: [], removed: [], conflicts: [...new Set(plan.conflicts.map((c) => c.path))] };
  const next = applyPlan(io.home, own, plan);
  next.entries.push(...others);
  mkdirSync(dirname(statePath), { recursive: true });
  writeState(statePath, next);
  return {
    written: [...new Set(plan.writes.map((w) => w.entry.path))],
    removed: [...new Set(plan.removes.map((e) => e.path))],
    conflicts: [],
  };
};

/**
 * After an install that reports to its registry: adds the hook to each tool it installed into that
 * doesn't have it yet. Returns what to tell the person. Never throws: usage must not fail an install.
 */
export const addUsageHooks = async (
  io: Io,
  install: { registry: string; targets: readonly string[] },
): Promise<string[]> => {
  try {
    if (!reportingTo(io, install.registry).enabled) return [];
    const have = hookedTools(io);
    const missing = install.targets.filter(isHookTool).filter((tool) => !have.includes(tool));
    if (missing.length === 0) return [];
    if (!onPath(io, "rmk"))
      return [
        "rmk isn't on PATH, so the AI tools couldn't run its usage hook; runs aren't counted. Install rmk globally (npm install --global @ronneai/rmk) to count them.",
      ];
    const result = await writeHooks(io, [...have, ...missing].sort(), false);
    if (result.conflicts.length)
      return [
        `rmk's usage hook wasn't added: ${result.conflicts.join(", ")} changed since rmk last wrote it.`,
      ];
    const lines = missing.map(
      (tool) =>
        `Added rmk's usage hook to ~/${HOOK_FILES[tool]}, to count runs of the items rmk installed.`,
    );
    if (missing.includes("codex"))
      lines.push("Codex runs a new hook only after you review it: open /hooks in Codex.");
    return lines;
  } catch {
    return [];
  }
};

/** `rmk telemetry off`: removes every usage hook. Returns the files changed. */
export const removeUsageHooks = async (io: Io, force = false) => writeHooks(io, [], force);

// ---------------------------------------------------------------------------------------------
// The hook itself: `rmk telemetry hook <tool>`, run by the AI tool with its event on stdin.

type Run = { names: string[]; types: string[]; trigger: string; outcome: string };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** `mcp__<server>__<tool>` → the server, or null (plugin servers aren't rmk's). */
const mcpServerOf = (toolName: unknown): string | null => {
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) return null;
  const rest = toolName.slice("mcp__".length);
  const end = rest.indexOf("__");
  const server = end === -1 ? rest : rest.slice(0, end);
  return server && !server.startsWith("plugin_") ? server : null;
};

/** One tool's event → the run it describes, or null when it isn't a run rmk counts. */
export const runOf = (tool: HookTool, payload: Record<string, unknown>): Run | null => {
  const event = payload.hook_event_name;
  if (tool === "claude-code") {
    // Cursor can load Claude Code's hooks too; its own hook counts the run.
    if ("cursor_version" in payload) return null;
    const delegated = typeof payload.agent_id === "string";
    if (event === "UserPromptExpansion") {
      if (payload.expansion_type !== "slash_command" || typeof payload.command_name !== "string")
        return null;
      return {
        names: [payload.command_name],
        types: ["skill", "command"],
        trigger: "user",
        outcome: "unknown",
      };
    }
    if (event === "SubagentStart") {
      // Its `agent_id` is the new subagent's own, so it doesn't say who delegated: the model did,
      // as far as the event tells.
      if (typeof payload.agent_type !== "string" || !payload.agent_type) return null;
      return {
        names: [payload.agent_type],
        types: ["agent"],
        trigger: "model",
        outcome: "unknown",
      };
    }
    if (event === "PostToolUse" || event === "PostToolUseFailure") {
      const failed = event === "PostToolUseFailure";
      const outcome = failed
        ? payload.is_interrupt === true
          ? "cancelled"
          : "error"
        : record(payload.tool_response).success === false
          ? "error"
          : "success";
      const trigger = delegated ? "agent" : "model";
      if (payload.tool_name === "Skill") {
        const skill = record(payload.tool_input).skill;
        return typeof skill === "string" && skill
          ? { names: [skill], types: ["skill"], trigger, outcome }
          : null;
      }
      const server =
        (typeof record(payload.mcp_server).name === "string"
          ? String(record(payload.mcp_server).name)
          : null) ?? mcpServerOf(payload.tool_name);
      return server ? { names: [server], types: ["mcp-server"], trigger, outcome } : null;
    }
    return null;
  }
  if (tool === "codex") {
    if (event === "SubagentStart" && typeof payload.agent_type === "string" && payload.agent_type)
      return {
        names: [payload.agent_type],
        types: ["agent"],
        trigger: "model",
        outcome: "unknown",
      };
    if (event === "PostToolUse") {
      const server = mcpServerOf(payload.tool_name);
      // Codex has no failure event, and a tool's response doesn't say reliably how it ended.
      return server
        ? { names: [server], types: ["mcp-server"], trigger: "model", outcome: "unknown" }
        : null;
    }
    return null;
  }
  if (event === "subagentStop" && typeof payload.subagent_type === "string") {
    const status = payload.status;
    const outcome =
      status === "completed"
        ? "success"
        : status === "error"
          ? "error"
          : status === "aborted"
            ? "cancelled"
            : "unknown";
    return { names: [payload.subagent_type], types: ["agent"], trigger: "model", outcome };
  }
  if (event === "afterMCPExecution" && typeof payload.mcp_server_name === "string") {
    let outcome = "unknown";
    try {
      const result =
        typeof payload.result_json === "string"
          ? JSON.parse(payload.result_json)
          : payload.result_json;
      outcome = record(result).isError === true ? "error" : "success";
    } catch {
      outcome = "unknown";
    }
    return { names: [payload.mcp_server_name], types: ["mcp-server"], trigger: "model", outcome };
  }
  return null;
};

/** The folder the event happened in: Claude Code's and Codex's `cwd`, Cursor's first workspace root. */
const folderOf = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.cwd === "string") return payload.cwd;
  const roots = payload.workspace_roots;
  return Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : null;
};

/** The nearest folder at or above `start` with an `rmk.lock`. */
const projectOf = (start: string): string | null => {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, LOCK_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** The installed item a run names: exactly one in the project's or the user's lockfile. */
const installedItem = (io: Io, folder: string | null, run: Run) => {
  const locks = [];
  const project = folder ? projectOf(folder) : null;
  if (project) locks.push(readLockfile(project));
  const user = userFiles(io);
  locks.push(readLockfile(user.lockDir, user.lockFile));
  const found: { item: string; version: string; registry: string }[] = [];
  for (const lock of locks) {
    if (!lock) continue;
    for (const [item, entry] of Object.entries(lock.items)) {
      const name = shortItemName(item);
      if (run.names.includes(name) && run.types.includes(entry.type))
        found.push({ item, version: entry.version, registry: lock.registry });
    }
  }
  return found.length === 1 ? found[0] : null;
};

const readStdin = async (io: Io): Promise<string> => {
  if (io.readStdin) return io.readStdin();
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

/** How long a queue may wait before the hook sends it itself. */
const HOOK_SEND_AFTER_MS = 60 * 60_000;

/**
 * `rmk telemetry hook <tool>`: reads the tool's event, and queues a run when it names an item rmk
 * installed and reporting is on for its registry. Prints nothing and never fails, so it can't get in
 * the way of the tool. Sends the queue in the background when nothing was sent for an hour.
 */
export const runHook = async (io: Io, tool: string): Promise<void> => {
  try {
    if (!isHookTool(tool)) return;
    const payload = record(JSON.parse(await readStdin(io)));
    const run = runOf(tool, payload);
    if (!run) return;
    const found = installedItem(io, folderOf(payload), run);
    if (!found || !reportingTo(io, found.registry).enabled) return;
    queueUsage(io, found.registry, [
      {
        day: dayOf(nowOf(io)),
        item: found.item,
        version: found.version,
        tool,
        event: "run",
        trigger: io.env.CI ? "ci" : run.trigger,
        outcome: run.outcome,
        count: 1,
      },
    ]);
    const last = lastSendAttempt(io, found.registry);
    if (!last || nowOf(io).getTime() - Date.parse(last) > HOOK_SEND_AFTER_MS)
      io.sendInBackground?.();
  } catch {
    // A hook must never fail the tool's run.
  }
};
