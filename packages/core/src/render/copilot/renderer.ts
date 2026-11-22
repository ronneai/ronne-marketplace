import { type ItemType, isItemType } from "../../item-types.js";
import { commandSkill, type SkillPlace, skillFolder, writtenSkill } from "../agents-skills.js";
import { alsoTarget, covered } from "../covered.js";
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
  toolName,
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
import { AGENT_TOOLS, EVENTS, hookMatcher, TOOL_EVENTS } from "./mappings.js";

/**
 * The GitHub Copilot renderer (feature 028). Where the Copilot CLI and VS Code's Copilot harness
 * read each type was checked against their documentation on 2026-11-22 (spec 028). Both read
 * `.github/` in a project and `~/.copilot/` in the home folder; skills go to `.github/skills/`,
 * not the shared `.agents/skills/`, which VS Code's Copilot harness doesn't read.
 */
export const RENDERER_ID = "copilot";
export const RENDERER_NAME = "GitHub Copilot";

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const unsupported = (message: string): RenderWarning => ({ code: "unsupported_field", message });

/** Copilot's folder: `.github/` in a project, `~/.copilot/` in the home folder. */
const home = (scope: RenderScope) => (scope === "project" ? ".github" : ".copilot");

const skills = (scope: RenderScope): SkillPlace => ({
  root: `${home(scope)}/skills`,
  readers: "Copilot's CLI and VS Code",
});

const renderAgent = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  overrides: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const front: Frontmatter = [
    ["name", n],
    ["description", String(item.manifest.description ?? "")],
  ];
  const tools: string[] = [];
  for (const canonical of strings(block.tools)) {
    const mapped = toolName(canonical, AGENT_TOOLS);
    if ("warning" in mapped) warnings.push(mapped.warning);
    else if (!tools.includes(mapped.name)) tools.push(mapped.name);
  }
  if (tools.length) front.push(["tools", tools]);
  const model = typeof overrides.model === "string" ? overrides.model : undefined;
  if (model) front.push(["model", model]);
  else if (block.model !== undefined && block.model !== "default")
    warnings.push(
      unsupported(
        `Copilot names models differently in the CLI and VS Code, so ${item.name}'s \`${String(block.model)}\` hint was left out; set targets.copilot.overrides.model to choose one.`,
      ),
    );
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Copilot takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  const preloaded = (item.dependencies ?? []).filter(
    (dependency) => dependency.type === "skill" && dependency.preload !== false,
  );
  if (preloaded.length)
    warnings.push(
      unsupported(
        `Copilot's agents can't preload skills in both the CLI and VS Code, so ${item.name}'s skills are installed but not preloaded; the agent finds them as any other skill.`,
      ),
    );
  return {
    changes: [
      {
        kind: "file",
        path: `${home(scope)}/agents/${n}.agent.md`,
        content: frontmatterMarkdown(item, front, fileText(item.files, block.prompt)),
      },
    ],
    warnings,
  };
};

/**
 * `always` rules are sections of the repository-wide instructions, `.github/copilot-instructions.md`
 * (`~/.copilot/copilot-instructions.md`): an instructions file with `applyTo: "**"` applies only
 * when Copilot works on files, not to a conversation (seen on the CLI 1.0.114, owner, 2026-11-22).
 * `glob` rules are instructions files, by path; `model` and `manual` rules, which the model picks or
 * a person asks for, are skills, as in Codex (024).
 */
const renderRule = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const body = fileText(item.files, block.body);
  const description = String(item.manifest.description ?? "");
  const root = skills(scope).root;
  switch (String(block.activation ?? "always")) {
    case "model":
      return {
        changes: [writtenSkill(item, n, [["description", description]], body, root)],
        warnings: [],
      };
    case "manual":
      return {
        changes: [
          writtenSkill(
            item,
            n,
            [
              ["description", description],
              ["disable-model-invocation", true],
            ],
            body,
            root,
          ),
        ],
        warnings: [],
      };
    case "glob":
      return {
        changes: [
          {
            kind: "file",
            path: `${home(scope)}/instructions/${n}.instructions.md`,
            content: frontmatterMarkdown(item, [["applyTo", strings(block.globs).join(",")]], body),
          },
        ],
        warnings: [],
      };
    default:
      return {
        changes: [
          {
            kind: "section",
            path: `${home(scope)}/copilot-instructions.md`,
            key: item.name,
            text: body,
          },
        ],
        warnings: [],
      };
  }
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A table's own entry, never one it inherits (`constructor`, `__proto__`). */
const own = (table: Partial<Record<string, string>>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** A path as one shell word: quoted when it holds anything but letters, digits and `._/-`. */
const shellWord = (path: string) =>
  /^[A-Za-z0-9._/-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;

/** A script rmk wrote, as the command that runs it: by its path, or from the home folder. */
const scriptCommand = (scope: RenderScope, path: string) =>
  scope === "project" ? shellWord(path) : `"$HOME"/${shellWord(path)}`;

/**
 * A hook is a file of its own, `.github/hooks/<n>.json` (`~/.copilot/hooks/<n>.json`), in the
 * CLI's format, which VS Code's Copilot harness reads too: no two items share a key.
 */
const renderHook = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const event = own(EVENTS, String(block.event));
  if (!event)
    return {
      changes: [],
      warnings: [
        unsupported(
          `GitHub Copilot has no event for \`${String(block.event)}\`, so ${item.name} was left out.`,
        ),
      ],
    };
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const run = record(block.run);
  const entry: Record<string, unknown> = { type: "command" };
  let command = typeof run.command === "string" ? run.command : "";
  if (typeof run.script === "string") {
    const path = `${home(scope)}/hooks/${n}/${run.script}`;
    changes.push({
      kind: "file",
      path,
      content: withHashMarker(item, fileText(item.files, run.script)),
      executable: true,
    });
    // A project's hooks run from the repository root (`cwd` is relative to it); the home folder's
    // by their full path.
    command = scriptCommand(scope, path);
  } else if (/\$RMK_[A-Z_]+/.test(command))
    warnings.push(
      unsupported(
        `${item.name}'s command uses an $RMK_ variable; Copilot passes the event as JSON on stdin instead, so the hook has to read it from there.`,
      ),
    );
  entry.bash = command;
  if (scope === "project") entry.cwd = ".";
  if (typeof block.timeout === "number") entry.timeoutSec = block.timeout;
  const tool = record(block.matcher).tool;
  if (typeof tool === "string") {
    const matcher = TOOL_EVENTS.has(event) ? hookMatcher(tool) : null;
    if (matcher) entry.matcher = matcher;
    else
      warnings.push({
        code: "unmapped_tool",
        message: TOOL_EVENTS.has(event)
          ? `GitHub Copilot has no hook matcher for \`${tool}\`, so ${item.name} runs for every tool.`
          : `GitHub Copilot doesn't filter \`${event}\` by tool, so ${item.name}'s tool filter was left out and it runs on every \`${event}\`.`,
      });
  }
  changes.push({
    kind: "file",
    path: `${home(scope)}/hooks/${n}.json`,
    content: json({ version: 1, hooks: { [event]: [entry] } }),
  });
  return { changes, warnings };
};

/**
 * `mcpServers.<n>` in `.mcp.json`, which the CLI and VS Code's Copilot harness both read (shared
 * with Claude Code), or `~/.copilot/mcp-config.json`. Variables stay `${NAME}`, never a value.
 */
const renderMcpServer = (
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const value: Record<string, unknown> = {};
  if (block.transport === "http") {
    value.type = "http";
    value.url = block.url;
    const headers = Object.entries(record(block.headers));
    if (headers.length) value.headers = Object.fromEntries(headers.map(([k, v]) => [k, String(v)]));
  } else {
    value.type = "stdio";
    value.command = block.command;
    // The CLI's reference marks `args` required for a local server, so it's always written.
    value.args = Array.isArray(block.args) ? block.args : [];
    const env = (Array.isArray(block.env) ? block.env : [])
      .map((v) => String(record(v).name ?? ""))
      .filter((name) => name);
    if (env.length)
      value.env = Object.fromEntries(env.map((name) => [name, envRef(name, "json-template")]));
  }
  value.tools = ["*"];
  return {
    changes: [
      {
        kind: "json-key",
        path: scope === "project" ? ".mcp.json" : ".copilot/mcp-config.json",
        key: ["mcpServers", n],
        value,
      },
    ],
    warnings: [],
  };
};

/** `lspServers.<n>` in `.github/lsp.json` (`~/.copilot/lsp-config.json`), read by the CLI. */
const renderLspServer = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const fileExtensions: Record<string, string> = {};
  for (const raw of Array.isArray(block.languages) ? block.languages : []) {
    const language = record(raw);
    const id = String(language.id ?? "");
    for (const extension of strings(language.extensions)) {
      const before = Object.hasOwn(fileExtensions, extension) ? fileExtensions[extension] : null;
      if (before !== null && before !== id)
        warnings.push(
          unsupported(
            `${item.name} gives \`${extension}\` to both \`${before}\` and \`${id}\`; Copilot takes one language per extension, so it's \`${id}\`.`,
          ),
        );
      fileExtensions[extension] = id;
    }
  }
  return {
    changes: [
      {
        kind: "json-key",
        path: scope === "project" ? ".github/lsp.json" : ".copilot/lsp-config.json",
        key: ["lspServers", n],
        value: {
          command: block.command,
          ...(Array.isArray(block.args) ? { args: block.args } : {}),
          fileExtensions,
        },
      },
    ],
    warnings,
  };
};

/** The CLI's status line, a user setting only (degraded). */
const renderStatusline = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  if (scope === "project")
    return {
      changes: [],
      warnings: [
        {
          code: "unsupported_type",
          message: `GitHub Copilot's status line is a setting in the home folder only, so ${item.name} was skipped; install it with --scope user.`,
        },
      ],
    };
  const name = String(block.script);
  const path = `.copilot/statusline/${n}/${name}`;
  return {
    changes: [
      {
        kind: "file",
        path,
        content: withHashMarker(item, fileText(item.files, name)),
        executable: true,
      },
      {
        kind: "json-key",
        path: ".copilot/settings.json",
        key: ["statusLine"],
        value: { type: "command", command: scriptCommand("user", path) },
      },
    ],
    warnings: [],
  };
};

/**
 * What Copilot leaves to another target of the same install (spec 028, "also a target"). The CLI
 * and VS Code's Copilot harness read a project's `.mcp.json`, run its `.claude/settings.json` hooks
 * and read its `AGENTS.md`; nothing is said of those tools' home-folder files, so only a project's
 * copy covers Copilot's.
 */
const coveredBy = (
  item: RenderInput,
  type: ItemType,
  block: Record<string, unknown>,
  context: RenderContext,
): ReturnType<typeof covered> | null => {
  if (context.scope !== "project") return null;
  if (type === "mcp-server" && alsoTarget(item, context, "claude-code"))
    return covered(item, RENDERER_NAME, "Claude Code", ".mcp.json");
  if (type === "hook" && alsoTarget(item, context, "claude-code"))
    return covered(item, RENDERER_NAME, "Claude Code", "hooks in .claude/settings.json");
  const activation = String(block.activation ?? "always");
  if (
    type === "rule" &&
    (activation === "always" || activation === "glob") &&
    alsoTarget(item, context, "codex")
  )
    return covered(item, RENDERER_NAME, "Codex", "AGENTS.md");
  return null;
};

const NO_PLACE: Partial<Record<ItemType, string>> = {
  "permission-policy":
    "GitHub Copilot has no allow or deny list a project or the home folder can hold",
  "output-style": "GitHub Copilot has no output styles",
};

export const copilotRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: async (probe) => {
    for (const path of [
      ".github/copilot-instructions.md",
      ".github/copilot",
      ".github/agents",
      ".github/instructions",
      ".github/prompts",
      ".github/hooks",
      ".github/skills",
      ".github/lsp.json",
    ])
      if (await probe.exists(path)) return true;
    return false;
  },
  supports: (type) => {
    switch (type) {
      case "output-style":
      case "permission-policy":
        return "none";
      case "statusline":
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
    const left = type ? coveredBy(item, type, block, context) : null;
    if (left) return left;
    switch (type) {
      case "skill":
        return skillFolder(item, n, String(block.entry ?? "SKILL.md"), skills(scope));
      case "agent":
        return renderAgent(item, n, block, targets.overrides, scope);
      case "rule":
        return renderRule(item, n, block, scope);
      case "command": {
        const { change, warnings } = commandSkill(item, n, block, skills(scope).root);
        return { changes: [change], warnings };
      }
      case "hook":
        return renderHook(item, n, block, scope);
      case "mcp-server":
        return renderMcpServer(n, block, scope);
      case "lsp-server":
        return renderLspServer(item, n, block, scope);
      case "statusline":
        return renderStatusline(item, n, block, scope);
      case "permission-policy":
      case "output-style":
        // `rmk` skips these before rendering (`supports` says none); said here for the goldens.
        return {
          changes: [],
          warnings: [
            {
              code: "unsupported_type",
              message: `${NO_PLACE[type]}, so ${item.name} was skipped there.`,
            },
          ],
        };
      case "bundle":
        // Its members are installed as items of their own (the resolver, 020); nothing to write.
        return { changes: [], warnings: [] };
      default:
        return {
          changes: [],
          warnings: [
            {
              code: "unsupported_type",
              message: `${item.name} (${String(type)}) isn't rendered for GitHub Copilot yet.`,
            },
          ],
        };
    }
  },
};
