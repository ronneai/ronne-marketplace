import { type ItemType, isItemType } from "../../item-types.js";
import { commandSkill, skillFolder } from "../agents-skills.js";
import {
  disabledWarning,
  envRef,
  type Frontmatter,
  fileText,
  frontmatterMarkdown,
  record,
  shortName,
  strings,
  targetsFor,
  withHashMarker,
} from "../helpers.js";
import type {
  Change,
  PlatformRenderer,
  RenderContext,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import { EVENTS, matcherFor } from "./mappings.js";

/**
 * The Cursor renderer (feature 025). Where Cursor (the editor and its `agent` CLI) reads each type
 * was checked against its documentation on 2026-09-28 (spec 025). Skills and commands go to the
 * cross-tool `.agents/skills/`, shared with Codex; everything else to `.cursor/`. Paths are relative
 * to the project, or to the home folder in user scope.
 */
export const RENDERER_ID = "cursor";
export const RENDERER_NAME = "Cursor";

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const unsupported = (message: string): RenderWarning => ({ code: "unsupported_field", message });

/**
 * Whether Claude Code's copy of this item, which Cursor also reads (its Third-Party Imports, on by
 * default), is written in the same install: then Cursor's own would be a second one.
 */
const claudeCodeCovers = (item: RenderInput, context: RenderContext) =>
  (context.targets ?? []).includes("claude-code") &&
  targetsFor(item.manifest, "claude-code").enabled;

const covered = (item: RenderInput, where: string): Rendered => ({
  changes: [],
  warnings: [
    {
      code: "covered_by_target",
      message: `Cursor reads Claude Code's copy of ${item.name} (${where}), so no second one was written.`,
    },
  ],
});

/** Skills and commands: `.agents/skills/`, unless only Claude Code's copy is written with it. */
const skillOrCommand = (
  item: RenderInput,
  n: string,
  context: RenderContext,
  render: () => Rendered,
): Rendered =>
  // With Codex also a target, `.agents/skills/` is written anyway: the same bytes, one entry.
  claudeCodeCovers(item, context) && !(context.targets ?? []).includes("codex")
    ? covered(item, `.claude/skills/${n}/`)
    : render();

const renderAgent = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const tools = strings(block.tools);
  const front: Frontmatter = [
    ["name", n],
    ["description", String(item.manifest.description ?? "")],
  ];
  const model = typeof overrides.model === "string" ? overrides.model : undefined;
  if (model) front.push(["model", model]);
  else if (block.model !== undefined && block.model !== "default")
    warnings.push(
      unsupported(
        `Cursor has no model for the \`${String(block.model)}\` hint, so ${item.name} uses the parent agent's; set targets.cursor.overrides.model to choose one.`,
      ),
    );
  if (tools.length) {
    // No tool list in Cursor; an agent that may not change anything can still be read-only.
    const changes = tools.some((tool) => ["edit", "write", "shell"].includes(tool));
    if (!changes) front.push(["readonly", true]);
    warnings.push(
      unsupported(
        `Cursor agents have no tool list, so ${item.name}'s tools were left out${changes ? "" : "; it's read-only, since none of them changes files or runs commands"}.`,
      ),
    );
  }
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Cursor takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  return {
    changes: [
      {
        kind: "file",
        path: `.cursor/agents/${n}.md`,
        content: frontmatterMarkdown(item, front, fileText(item.files, block.prompt)),
      },
    ],
    warnings,
  };
};

const renderRule = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  if (scope === "user")
    return {
      changes: [],
      warnings: [
        {
          code: "unsupported_type",
          message: `Cursor keeps user rules in its settings, not in a file, so ${item.name} was skipped; paste it into Cursor Settings → Rules, or install it in a project.`,
        },
      ],
    };
  const front: Frontmatter = [];
  switch (String(block.activation ?? "always")) {
    case "glob":
      // Cursor's own examples write globs unquoted, comma-separated.
      front.push(["globs", { raw: strings(block.globs).join(", ") }], ["alwaysApply", false]);
      break;
    case "model":
      front.push(["description", String(item.manifest.description ?? "")], ["alwaysApply", false]);
      break;
    case "manual":
      front.push(["alwaysApply", false]);
      break;
    default:
      front.push(["alwaysApply", true]);
  }
  return {
    changes: [
      {
        kind: "file",
        path: `.cursor/rules/${n}.mdc`,
        content: frontmatterMarkdown(item, front, fileText(item.files, block.body)),
      },
    ],
    warnings: [],
  };
};

const HOOKS = ".cursor/hooks.json";

/**
 * One element of `hooks.<event>` in `hooks.json`, and the file's `version: 1`, which every hook item
 * wants identically (the applier keeps one entry while any of them does).
 */
const renderHook = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  context: RenderContext,
): Rendered => {
  if (claudeCodeCovers(item, context)) return covered(item, "hooks in .claude/settings.json");
  const event = EVENTS[String(block.event)];
  if (!event)
    return {
      changes: [],
      warnings: [
        unsupported(
          `Cursor has no event for \`${String(block.event)}\`, so ${item.name} was left out.`,
        ),
      ],
    };
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const run = record(block.run);
  let command = typeof run.command === "string" ? run.command : "";
  if (typeof run.script === "string") {
    const path = `.cursor/hooks/${n}/${run.script}`;
    changes.push({
      kind: "file",
      path,
      content: withHashMarker(item, fileText(item.files, run.script)),
      executable: true,
    });
    // Project hooks run from the project root, user hooks from ~/.cursor/ (Cursor's docs).
    command = context.scope === "project" ? path : `hooks/${n}/${run.script}`;
  } else if (/\$RMK_[A-Z_]+/.test(command))
    warnings.push(
      unsupported(
        `${item.name}'s command uses an $RMK_ variable; Cursor passes the event as JSON on stdin instead, so the hook has to read it from there.`,
      ),
    );
  const entry: Record<string, unknown> = { command };
  if (typeof block.timeout === "number") entry.timeout = block.timeout;
  const tool = record(block.matcher).tool;
  if (typeof tool === "string") {
    const matcher = matcherFor(tool);
    if (matcher) entry.matcher = matcher;
    else
      warnings.push({
        code: "unmapped_tool",
        message: `Cursor has no hook matcher for \`${tool}\`, so ${item.name} runs for every tool.`,
      });
  }
  changes.push(
    { kind: "json-key", path: HOOKS, key: ["version"], value: 1 },
    { kind: "json-array-item", path: HOOKS, key: ["hooks", event], item: entry },
  );
  return { changes, warnings };
};

/** `${NAME}` in a manifest value as Cursor's `${env:NAME}`. */
const cursorRefs = (text: string) =>
  text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => envRef(name, "cursor"));

const renderMcpServer = (n: string, block: Record<string, unknown>): Rendered => {
  const value: Record<string, unknown> = {};
  if (block.transport === "http") {
    value.url = block.url;
    const headers = Object.entries(record(block.headers));
    if (headers.length)
      value.headers = Object.fromEntries(headers.map(([k, v]) => [k, cursorRefs(String(v))]));
  } else {
    value.command = block.command;
    if (Array.isArray(block.args)) value.args = block.args;
    const env = (Array.isArray(block.env) ? block.env : [])
      .map((v) => String(record(v).name ?? ""))
      .filter((name) => name);
    if (env.length)
      value.env = Object.fromEntries(env.map((name) => [name, envRef(name, "cursor")]));
  }
  return {
    changes: [{ kind: "json-key", path: ".cursor/mcp.json", key: ["mcpServers", n], value }],
    warnings: [],
  };
};

/** One rule as Cursor's CLI writes it, or null when it can't say it. */
const permissionToken = (tool: string, pattern: string | undefined): string | null => {
  const mcp = /^mcp:([^/]+)(?:\/(.+))?$/.exec(tool);
  if (mcp) return `Mcp(${mcp[1]}:${mcp[2] ?? "*"})`;
  switch (tool) {
    case "shell": {
      if (pattern === undefined) return "Shell(*)";
      const [command, ...args] = pattern.trim().split(/\s+/);
      if (!command) return null;
      return args.length ? `Shell(${command}:${args.join(" ")})` : `Shell(${command})`;
    }
    case "read":
      return `Read(${pattern ?? "**"})`;
    case "edit":
    case "write":
      return `Write(${pattern ?? "**"})`;
    case "web-fetch":
      return `WebFetch(${pattern ?? "*"})`;
    default:
      return null;
  }
};

/**
 * `permissions` in the `agent` CLI's config (degraded): Cursor's editor doesn't document it, and the
 * CLI has `allow` and `deny` but no `ask`.
 */
const renderPermissionPolicy = (
  item: RenderInput,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const path = scope === "project" ? ".cursor/cli.json" : ".cursor/cli-config.json";
  for (const raw of Array.isArray(block.rules) ? block.rules : []) {
    const rule = record(raw);
    const tool = String(rule.tool ?? "");
    const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
    const decision = String(rule.decision);
    const token = permissionToken(tool, pattern);
    const label = `\`${tool}\`${pattern ? ` \`${pattern}\`` : ""}`;
    if (decision === "ask") {
      warnings.push(
        unsupported(
          `Cursor's CLI has no "ask" permissions, so the rule for ${label} in ${item.name} was left out.`,
        ),
      );
      continue;
    }
    if (!token || (decision !== "allow" && decision !== "deny")) {
      warnings.push(
        unsupported(
          `Cursor's CLI can't express the rule for ${label} in ${item.name}, so it was left out.`,
        ),
      );
      continue;
    }
    changes.push({ kind: "json-array-item", path, key: ["permissions", decision], item: token });
  }
  return { changes, warnings };
};

export const cursorRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: (probe) => probe.exists(".cursor"),
  supports: (type) => {
    switch (type) {
      case "output-style":
      case "statusline":
      case "lsp-server":
        return "none";
      case "permission-policy":
        return "degraded";
      default:
        return "native";
    }
  },
  render(item, context) {
    const targets = targetsFor(item.manifest, RENDERER_ID);
    if (!targets.enabled)
      return { changes: [], warnings: [disabledWarning(item.name, RENDERER_NAME)] };
    const type = isItemType(String(item.manifest.type)) ? (item.manifest.type as ItemType) : null;
    const block = record(type ? item.manifest[type] : undefined);
    const n = shortName(item.name);
    const scope: RenderScope = context.scope;
    switch (type) {
      case "skill":
        return skillOrCommand(item, n, context, () => ({
          changes: [skillFolder(item, n, String(block.entry ?? "SKILL.md"))],
          warnings: [],
        }));
      case "agent":
        return renderAgent(item, n, block, targets.overrides);
      case "rule":
        return renderRule(item, n, block, scope);
      case "command":
        return skillOrCommand(item, n, context, () => {
          const { change, warnings } = commandSkill(item, n, block);
          return { changes: [change], warnings };
        });
      case "hook":
        return renderHook(item, n, block, context);
      case "mcp-server":
        return renderMcpServer(n, block);
      case "permission-policy":
        return renderPermissionPolicy(item, block, scope);
      case "bundle":
        // Its members are installed as items of their own (the resolver, 020); nothing to write.
        return { changes: [], warnings: [] };
      default:
        return {
          changes: [],
          warnings: [
            {
              code: "unsupported_type",
              message: `${item.name} (${String(type)}) isn't rendered for Cursor yet.`,
            },
          ],
        };
    }
  },
};
