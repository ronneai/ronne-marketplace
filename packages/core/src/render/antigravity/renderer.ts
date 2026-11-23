import { type ItemType, isItemType } from "../../item-types.js";
import {
  AGENTS_SKILLS,
  commandSkill,
  type SkillPlace,
  skillFolder,
  writtenSkill,
} from "../agents-skills.js";
import {
  disabledWarning,
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
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import {
  EVENTS,
  hookMatcher,
  MODELS,
  PERMISSION_ACTIONS,
  TOOL_EVENTS,
  toolOf,
} from "./mappings.js";

/**
 * The Antigravity renderer (feature 029): the Antigravity CLI (`agy`) and what it shares with the
 * Antigravity app. Where each type goes was checked against antigravity.google/docs on 2026-11-22
 * (spec 029): `.agents/` in a project, `~/.gemini/config/` in the home folder (shared by the CLI and
 * the app), and the CLI's own settings in `~/.gemini/antigravity-cli/`.
 */
export const RENDERER_ID = "antigravity";
export const RENDERER_NAME = "Antigravity";

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const unsupported = (message: string): RenderWarning => ({ code: "unsupported_field", message });

/** Antigravity's folder: `.agents/` in a project, `~/.gemini/config/` in the home folder. */
const home = (scope: RenderScope) => (scope === "project" ? ".agents" : ".gemini/config");

/** The shared `.agents/skills/` in a project; Antigravity's own skills folder in the home folder. */
const skills = (scope: RenderScope): SkillPlace => ({
  root: scope === "project" ? AGENTS_SKILLS : ".gemini/config/skills",
  readers: RENDERER_NAME,
});

/** Antigravity truncates a rule file over this many bytes (rules, 2026-11-22). */
const RULE_LIMIT = 24_000;

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
    const name = toolOf(canonical);
    if (name) {
      if (!tools.includes(name)) tools.push(name);
    } else
      warnings.push({
        code: "unmapped_tool",
        message: canonical.startsWith("mcp:")
          ? `Antigravity's agents can't name an MCP tool, so \`${canonical}\` was left out of ${item.name}'s tools; the agent can still use the server's tools.`
          : `The tool \`${canonical}\` has no equivalent in Antigravity, so it was left out.`,
      });
  }
  // No `tools` key means Antigravity's default set (manifest spec: "omitted = platform default"),
  // also when nothing in the list maps; a list limits the agent to those tools.
  if (tools.length) front.push(["tools", tools]);
  const model =
    typeof overrides.model === "string"
      ? overrides.model
      : typeof block.model === "string"
        ? MODELS[block.model]
        : undefined;
  if (model) front.push(["model", model]);
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Antigravity takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  const preloaded = (item.dependencies ?? []).filter(
    (dependency) => dependency.type === "skill" && dependency.preload !== false,
  );
  if (preloaded.length)
    warnings.push(
      unsupported(
        `Antigravity's agents can't preload skills, so ${item.name}'s skills are installed but not preloaded; the agent finds them as any other skill.`,
      ),
    );
  return {
    changes: [
      {
        kind: "file",
        path: `${home(scope)}/agents/${n}.md`,
        content: frontmatterMarkdown(item, front, fileText(item.files, block.prompt)),
      },
    ],
    warnings,
  };
};

/**
 * `.agents/rules/<n>.md` with `trigger` (a missing or misspelled one drops the rule silently, so
 * the goldens pin it). `manual` rules are skills: the CLI doesn't support rule mentions (owner,
 * 2026-11-22), and every skill is a slash command.
 */
const renderRule = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const body = fileText(item.files, block.body);
  const description = String(item.manifest.description ?? "");
  const activation = String(block.activation ?? "always");
  if (activation === "manual")
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
          skills(scope).root,
        ),
      ],
      warnings: [],
    };
  const front: Frontmatter =
    activation === "glob"
      ? [
          ["trigger", "glob"],
          ["description", description],
          ["globs", strings(block.globs).join(", ")],
        ]
      : activation === "model"
        ? [
            ["trigger", "model_decision"],
            ["description", description],
          ]
        : [
            ["trigger", "always_on"],
            ["description", description],
          ];
  const content = frontmatterMarkdown(item, front, body);
  const warnings: RenderWarning[] =
    new TextEncoder().encode(content).length > RULE_LIMIT
      ? [
          unsupported(
            `${item.name} is over ${RULE_LIMIT.toLocaleString("en")} bytes; Antigravity reads only the first ${RULE_LIMIT.toLocaleString("en")} of a rule file.`,
          ),
        ]
      : [];
  return {
    changes: [{ kind: "file", path: `${home(scope)}/rules/${n}.md`, content }],
    warnings,
  };
};

/** A table's own entry, never one it inherits (`constructor`, `__proto__`). */
const own = (table: Partial<Record<string, string>>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** A path as one shell word: quoted when it holds anything but letters, digits and `._/-`. */
const shellWord = (path: string) =>
  /^[A-Za-z0-9._/-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;

/**
 * A project hook's command, run from the project root: Antigravity runs it from `.agents/`. The
 * `cd` is a line of its own, so nothing in the command (`&`, a `#` comment) can take it apart
 * (seen on the CLI 1.5.14: `true & pwd` and a leading comment both ran at the root).
 */
const atRoot = (command: string) => `cd .. || exit 1\n${command}`;

/**
 * A hook is a key of its own in `hooks.json`, `<n>`, since Antigravity names its hooks. One invalid
 * hook makes Antigravity drop the whole file (seen on the CLI 1.5.14), so only the documented
 * shapes are written: tool events as `{ matcher, hooks: [handler] }`, the others as bare handlers.
 * A hook runs from the folder its `hooks.json` is in (`.agents/` or `~/.gemini/config/`), so a
 * script runs as `./hooks/<n>/<script>` in both scopes (seen on the CLI 1.5.14, 2026-11-22).
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
          `Antigravity has no event for \`${String(block.event)}\`, so ${item.name} was left out.`,
        ),
      ],
    };
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const run = record(block.run);
  let command = typeof run.command === "string" ? run.command : "";
  if (typeof run.script === "string") {
    const path = `hooks/${n}/${run.script}`;
    changes.push({
      kind: "file",
      path: `${home(scope)}/${path}`,
      content: withHashMarker(item, fileText(item.files, run.script)),
      executable: true,
    });
    // A hook runs from the folder its hooks.json is in; in a project, rmk runs it from the root.
    command =
      scope === "project" ? atRoot(`./${shellWord(`.agents/${path}`)}`) : `./${shellWord(path)}`;
  } else if (/\$RMK_[A-Z_]+/.test(command))
    warnings.push(
      unsupported(
        `${item.name}'s command uses an $RMK_ variable; Antigravity passes the event as JSON on stdin instead, so the hook has to read it from there.`,
      ),
    );
  // A project's hook runs from `.agents/` (seen on the CLI 1.5.14), so its command starts at the
  // project root, as in the other tools; a home-folder hook runs from `~/.gemini/config/`.
  if (typeof run.script !== "string" && scope === "project" && command) command = atRoot(command);
  const handler: Record<string, unknown> = { type: "command", command };
  if (typeof block.timeout === "number") handler.timeout = block.timeout;
  const tool = record(block.matcher).tool;
  let entry: Record<string, unknown> = handler;
  if (TOOL_EVENTS.has(event)) {
    entry = { hooks: [handler] };
    const matcher = typeof tool === "string" ? hookMatcher(tool) : null;
    if (matcher) entry = { matcher, hooks: [handler] };
    else if (typeof tool === "string")
      warnings.push({
        code: "unmapped_tool",
        message: `Antigravity has no hook matcher for \`${tool}\`, so ${item.name} runs for every tool.`,
      });
  } else if (typeof tool === "string")
    warnings.push({
      code: "unmapped_tool",
      message: `Antigravity doesn't filter \`${event}\` by tool, so ${item.name}'s tool filter was left out and it runs on every \`${event}\`.`,
    });
  changes.push({
    kind: "json-key",
    path: `${home(scope)}/hooks.json`,
    key: [n],
    value: { [event]: [entry] },
  });
  return { changes, warnings };
};

/** A reference to an environment variable, `${NAME}` (the manifest's syntax), which Antigravity won't expand. */
const VARIABLE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

/** The variables a value names, for a warning. */
const variablesIn = (value: unknown): string[] =>
  [...String(value).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] ?? "");

/**
 * `mcpServers.<n>` in `.agents/mcp_config.json` (`~/.gemini/config/mcp_config.json`), degraded:
 * Antigravity expands no variable in it (on the CLI 1.5.14 an `env` value of `${NAME}` reached the
 * server as written) and `rmk` never writes a secret, so `env` and any header that names a variable
 * are left out, with a warning naming each variable. The server inherits Antigravity's own
 * environment (seen on the CLI 1.5.14), so setting them where Antigravity starts is enough.
 */
const renderMcpServer = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const value: Record<string, unknown> = {};
  if (block.transport === "http") {
    value.serverUrl = block.url;
    const kept: [string, string][] = [];
    const dropped: string[] = [];
    for (const [key, raw] of Object.entries(record(block.headers))) {
      const header = String(raw);
      if (VARIABLE.test(header)) dropped.push(key);
      else kept.push([key, header]);
    }
    if (kept.length) value.headers = Object.fromEntries(kept);
    if (dropped.length)
      warnings.push(
        unsupported(
          `Antigravity can't reference an environment variable in an MCP config, so ${item.name}'s ${dropped.map((h) => `\`${h}\``).join(", ")} header${dropped.length > 1 ? "s were" : " was"} left out; add ${dropped.length > 1 ? "them" : "it"} in Antigravity's MCP settings.`,
        ),
      );
  } else {
    value.command = block.command;
    if (Array.isArray(block.args) && block.args.length) value.args = block.args;
  }
  const names = (Array.isArray(block.env) ? block.env : [])
    .map((v) => String(record(v).name ?? ""))
    .filter((name) => name);
  if (names.length)
    warnings.push(
      unsupported(
        `Antigravity can't reference an environment variable in an MCP config, so ${item.name}'s ${names.map((name) => `\`${name}\``).join(", ")} ${names.length > 1 ? "weren't" : "wasn't"} written; set ${names.length > 1 ? "them" : "it"} in the environment Antigravity starts in, which the server inherits.`,
      ),
    );
  const literal = [
    ...variablesIn(block.url),
    ...(Array.isArray(block.args) ? block.args.flatMap(variablesIn) : []),
  ];
  if (literal.length)
    warnings.push(
      unsupported(
        `Antigravity doesn't expand ${[...new Set(literal)].map((name) => `\`\${${name}}\``).join(", ")} in ${item.name}'s ${block.transport === "http" ? "URL" : "arguments"}, so the server gets ${literal.length > 1 ? "them" : "it"} as written.`,
      ),
    );
  return {
    changes: [
      {
        kind: "json-key",
        path: `${home(scope)}/mcp_config.json`,
        key: ["mcpServers", n],
        value,
      },
    ],
    warnings,
  };
};

/** The CLI's own settings file, in the home folder only. */
const CLI_SETTINGS = ".gemini/antigravity-cli/settings.json";

const homeOnly = (item: RenderInput, what: string): Rendered => ({
  changes: [],
  warnings: [
    {
      code: "unsupported_type",
      message: `Antigravity's ${what} ${what.endsWith("s") ? "are settings" : "is a setting"} in the home folder only, so ${item.name} was skipped; install it with --scope user.`,
    },
  ],
});

/** One permission rule as Antigravity writes it (`action(target)`), or null when it can't. */
const permissionRule = (
  tool: string,
  pattern: string | undefined,
  decision: string,
): string | null => {
  const mcp = /^mcp:([^/]+)(?:\/(.+))?$/.exec(tool);
  if (mcp) return pattern === undefined ? `mcp(${mcp[1]}/${mcp[2] ?? "*"})` : null;
  const action = own(PERMISSION_ACTIONS, tool);
  if (!action) return null;
  if (pattern === undefined) return `${action}(*)`;
  if (action !== "command") return `${action}(${pattern})`;
  // A command rule is a prefix (on the CLI 1.5.14 `command(echo)` denied `echo hi`), so a
  // pattern's trailing `*` is dropped; one anywhere else can't be said.
  const prefix = pattern.endsWith("*") ? pattern.slice(0, -1).trimEnd() : pattern;
  if (!prefix) return "command(*)";
  if (prefix.includes("*")) return null;
  // Antigravity has no exact command rule (on the CLI 1.5.14 `command(regex:^echo hi$)` also
  // denied `echo hi there`), so a pattern without `*` would widen an `allow`: left out. A `deny` or
  // `ask` that covers more is the safe side, and stays a prefix.
  if (prefix === pattern && decision === "allow") return null;
  return `command(${prefix})`;
};

/** `permissions.allow`, `.ask` and `.deny` in the CLI's settings (degraded, home folder only). */
const renderPermissionPolicy = (
  item: RenderInput,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  if (scope === "project") return homeOnly(item, "permissions");
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  for (const raw of Array.isArray(block.rules) ? block.rules : []) {
    const rule = record(raw);
    const tool = String(rule.tool ?? "");
    const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
    const written = permissionRule(tool, pattern, String(rule.decision));
    if (written === null) {
      warnings.push(
        unsupported(
          `Antigravity can't express the rule for \`${tool}\`${pattern ? ` \`${pattern}\`` : ""} in ${item.name}, so it was left out.`,
        ),
      );
      continue;
    }
    changes.push({
      kind: "json-array-item",
      path: CLI_SETTINGS,
      key: ["permissions", String(rule.decision)],
      item: written,
    });
  }
  return { changes, warnings };
};

/** The CLI's status line, a user setting only (degraded), run through `sh -c`. */
const renderStatusline = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  if (scope === "project") return homeOnly(item, "status line");
  const name = String(block.script);
  const path = `.gemini/antigravity-cli/statusline/${n}/${name}`;
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
        path: CLI_SETTINGS,
        key: ["statusLine"],
        value: { type: "command", command: `"$HOME"/${shellWord(path)}` },
      },
    ],
    warnings: [],
  };
};

const NO_PLACE: Partial<Record<ItemType, string>> = {
  "output-style": "Antigravity has no output styles",
  "lsp-server": "Antigravity takes no language servers",
};

export const antigravityRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: async (probe) => {
    // Not `.agents/` alone, nor `.agents/skills/`: Codex, Cursor and Devin share that folder.
    for (const path of [
      ".agents/rules",
      ".agents/agents",
      ".agents/hooks.json",
      ".agents/mcp_config.json",
    ])
      if (await probe.exists(path)) return true;
    return false;
  },
  supports: (type) => {
    switch (type) {
      case "output-style":
      case "lsp-server":
        return "none";
      case "mcp-server":
      case "permission-policy":
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
        return renderMcpServer(item, n, block, scope);
      case "permission-policy":
        return renderPermissionPolicy(item, block, scope);
      case "statusline":
        return renderStatusline(item, n, block, scope);
      case "output-style":
      case "lsp-server":
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
              message: `${item.name} (${String(type)}) isn't rendered for Antigravity yet.`,
            },
          ],
        };
    }
  },
};
