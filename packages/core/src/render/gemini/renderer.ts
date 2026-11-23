import { type ItemType, isItemType } from "../../item-types.js";
import { skillFolder, writtenSkill } from "../agents-skills.js";
import { tomlString, tomlText, wellFormed } from "../codex/toml.js";
import {
  disabledWarning,
  envRef,
  type Frontmatter,
  fileText,
  frontmatterMarkdown,
  managedMarker,
  record,
  shortName,
  strings,
  targetsFor,
  trimTrailingNewlines,
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
  DECISIONS,
  EVENTS,
  hookMatcher,
  LOOSER_MODES,
  namesOf,
  PRIORITIES,
  TOOL_EVENTS,
  TOOLS,
  toolOf,
} from "./mappings.js";

/**
 * The Gemini CLI renderer (feature 029). Where Gemini CLI reads each type was checked against
 * geminicli.com/docs and the CLI 0.70.0's source on 2026-11-22 (spec 029): `.gemini/` and
 * `GEMINI.md` in a project, `~/.gemini/` in the home folder. Skills go to the cross-tool
 * `.agents/skills/` (`~/.agents/skills/`), which Gemini CLI reads before `.gemini/skills/`.
 */
export const RENDERER_ID = "gemini";
export const RENDERER_NAME = "Gemini CLI";

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const unsupported = (message: string): RenderWarning => ({ code: "unsupported_field", message });

/** The shared skills folder, as Gemini CLI reads it. */
const SKILLS = { root: ".agents/skills", readers: RENDERER_NAME };

/** Gemini CLI's context file: `GEMINI.md` at the project root, or `~/.gemini/GEMINI.md`. */
const geminiMd = (scope: RenderScope) => (scope === "project" ? "GEMINI.md" : ".gemini/GEMINI.md");

/**
 * `.gemini/agents/<n>.md`. The CLI 0.70.0 checks the frontmatter strictly (an unknown key, or a
 * tool name it can't parse, and the agent doesn't load), so only `name`, `description`, `tools` and
 * `model` are written, and only names from the table.
 */
const renderAgent = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const front: Frontmatter = [
    ["name", n],
    ["description", String(item.manifest.description ?? "")],
  ];
  const tools: string[] = [];
  for (const canonical of strings(block.tools)) {
    const names = namesOf(canonical);
    if (names) {
      for (const name of names) if (!tools.includes(name)) tools.push(name);
    } else
      warnings.push({
        code: "unmapped_tool",
        message: `The tool \`${canonical}\` has no name Gemini CLI can take, so it was left out of ${item.name}'s tools.`,
      });
  }
  // No `tools` key gives the agent its parent's tools (subagents, 2026-11-22).
  if (tools.length) front.push(["tools", tools]);
  const model = typeof overrides.model === "string" ? overrides.model : undefined;
  if (model) front.push(["model", model]);
  else if (block.model !== undefined && block.model !== "default")
    warnings.push(
      unsupported(
        `Gemini CLI has no model for the \`${String(block.model)}\` hint, so ${item.name} uses the session's model; set targets.gemini.overrides.model to choose one.`,
      ),
    );
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Gemini CLI takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  const preloaded = (item.dependencies ?? []).filter(
    (dependency) => dependency.type === "skill" && dependency.preload !== false,
  );
  if (preloaded.length)
    warnings.push(
      unsupported(
        `Gemini CLI's agents can't preload skills, so ${item.name}'s skills are installed but not preloaded; the agent finds them as any other skill.`,
      ),
    );
  return {
    changes: [
      {
        kind: "file",
        path: `.gemini/agents/${n}.md`,
        content: frontmatterMarkdown(item, front, fileText(item.files, block.prompt)),
      },
    ],
    warnings,
  };
};

/**
 * `.gemini/commands/<n>.toml` with `description` and `prompt`. Gemini CLI puts what the person typed
 * where the prompt says `{{args}}`, so a command's one argument becomes `{{args}}`; with more, their
 * placeholders stay with a note, as in a command skill.
 */
const renderCommand = (item: RenderInput, n: string, block: Record<string, unknown>): Rendered => {
  const warnings: RenderWarning[] = [];
  const args = (Array.isArray(block.args) ? block.args : []).map(record);
  let prompt = trimTrailingNewlines(fileText(item.files, block.body));
  const [only] = args;
  if (args.length === 1 && only) {
    prompt = prompt.replaceAll(`{{${String(only.name ?? "")}}}`, "{{args}}");
  } else if (args.length > 1) {
    prompt += `\n\n## Arguments\n\nWhat the person typed after the command is in {{args}}. Where this text says \`{{name}}\`, use the matching part of it, or ask them:\n\n${args
      .map(
        (arg) =>
          `- \`${String(arg.name ?? "")}\`${arg.required ? "" : " (optional)"}${
            typeof arg.description === "string" ? `: ${arg.description}` : ""
          }`,
      )
      .join("\n")}`;
    warnings.push(
      unsupported(
        `Gemini CLI passes a command one argument, {{args}}, so ${item.name}'s placeholders stay in its text, with a note saying what each one is.`,
      ),
    );
  }
  // Gemini CLI runs `!{…}` in a command's prompt as a shell command and inlines `@{…}` as a file.
  if (/[!@]\{/.test(prompt))
    warnings.push(
      unsupported(
        `${item.name}'s text has \`!{…}\` or \`@{…}\`, which Gemini CLI runs as a shell command or reads as a file when the command is used.`,
      ),
    );
  const lines = [
    managedMarker(item.name, item.version, "hash"),
    `description = ${tomlString(String(item.manifest.description ?? ""))}`,
    `prompt = ${tomlText(`${prompt}\n`)}`,
  ];
  return {
    changes: [
      { kind: "file", path: `.gemini/commands/${n}.toml`, content: `${lines.join("\n")}\n` },
    ],
    warnings,
  };
};

/**
 * Rules as Codex writes them (024), with `GEMINI.md` for `AGENTS.md`: `always` and `glob` as a fenced
 * section, `glob` opening with the files it's for; `model` and `manual` as skills.
 */
const renderRule = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const body = fileText(item.files, block.body);
  const description = String(item.manifest.description ?? "");
  switch (String(block.activation ?? "always")) {
    case "model":
      return {
        changes: [writtenSkill(item, n, [["description", description]], body)],
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
          ),
        ],
        warnings: [],
      };
    case "glob": {
      const globs = strings(block.globs).map((glob) => `\`${glob}\``);
      const scopeLine = `These rules apply to files matching ${globs.join(", ")}.\n\n`;
      return {
        changes: [
          { kind: "section", path: geminiMd(scope), key: item.name, text: `${scopeLine}${body}` },
        ],
        warnings: [],
      };
    }
    default:
      return {
        changes: [{ kind: "section", path: geminiMd(scope), key: item.name, text: body }],
        warnings: [],
      };
  }
};

/** Gemini CLI's settings, in both scopes: `.gemini/settings.json` or `~/.gemini/settings.json`. */
const SETTINGS = ".gemini/settings.json";

/** A table's own entry, never one it inherits (`constructor`, `__proto__`). */
const own = <T>(table: Partial<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** A path as one shell word: quoted when it holds anything but letters, digits and `._/-`. */
const shellWord = (path: string) =>
  /^[A-Za-z0-9._/-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;

/**
 * A hook is a `json-array-item` under `hooks.<Event>` in `settings.json`, with the item's name as
 * the hook's `name` and the timeout in milliseconds. Hooks run from the project folder. Gemini CLI
 * puts the project folder, already shell-quoted, where a command says `$GEMINI_PROJECT_DIR` (the
 * CLI 0.70.0's `expandCommand`), so a project script runs as `$GEMINI_PROJECT_DIR/.gemini/hooks/…`
 * with no quotes around the variable; a home-folder one as `"$HOME"/.gemini/hooks/…`.
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
          `Gemini CLI has no event for \`${String(block.event)}\`, so ${item.name} was left out.`,
        ),
      ],
    };
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const run = record(block.run);
  let command = typeof run.command === "string" ? run.command : "";
  if (typeof run.script === "string" && run.script.includes("$"))
    // Gemini CLI replaces `$NAME` in every settings value when it loads them, quoted or not, so a
    // command can't name such a path.
    return {
      changes: [],
      warnings: [
        unsupported(
          `Gemini CLI would read the \`$\` in ${item.name}'s script name \`${run.script}\` as a variable, so the hook was left out; rename the script.`,
        ),
      ],
    };
  if (typeof run.script === "string") {
    const path = `.gemini/hooks/${n}/${run.script}`;
    changes.push({
      kind: "file",
      path,
      content: withHashMarker(item, fileText(item.files, run.script)),
      executable: true,
    });
    command =
      scope === "project" ? `$GEMINI_PROJECT_DIR/${shellWord(path)}` : `"$HOME"/${shellWord(path)}`;
  } else {
    if (/\$RMK_[A-Z_]+/.test(command))
      warnings.push(
        unsupported(
          `${item.name}'s command uses an $RMK_ variable; Gemini CLI passes the event as JSON on stdin instead, so the hook has to read it from there.`,
        ),
      );
    // Settings load replaces `$NAME` with its value from Gemini CLI's environment, and a project
    // hook's command is then saved in `~/.gemini/trusted_hooks.json` (the CLI 0.70.0), so a secret
    // a command names would end up in that file.
    if (/\$(?:\w|\{)/.test(command.replaceAll(/\$RMK_[A-Z_]+/g, "")))
      warnings.push(
        unsupported(
          `Gemini CLI puts the value of each variable in ${item.name}'s command into it when it loads its settings, and may save the result in ~/.gemini/trusted_hooks.json; to keep a value out of files, use a script that reads the variable.`,
        ),
      );
  }
  const handler: Record<string, unknown> = { type: "command", command, name: n };
  if (typeof block.timeout === "number") handler.timeout = block.timeout * 1000;
  const entry: Record<string, unknown> = {};
  const tool = record(block.matcher).tool;
  if (typeof tool === "string") {
    const matcher = TOOL_EVENTS.has(event) ? hookMatcher(tool) : null;
    if (matcher) entry.matcher = matcher;
    else
      warnings.push({
        code: "unmapped_tool",
        message: TOOL_EVENTS.has(event)
          ? `Gemini CLI has no hook matcher for \`${tool}\`, so ${item.name} runs for every tool.`
          : `Gemini CLI doesn't filter \`${event}\` by tool, so ${item.name}'s tool filter was left out and it runs on every \`${event}\`.`,
      });
  }
  entry.hooks = [handler];
  changes.push({ kind: "json-array-item", path: SETTINGS, key: ["hooks", event], item: entry });
  return { changes, warnings };
};

/**
 * `mcpServers.<n>` in `settings.json`: stdio as `command`, `args` and `env` with `${NAME}`; http as
 * `httpUrl` (streamable HTTP; `url` is SSE) and `headers` as the manifest has them. Gemini CLI
 * expands `${NAME}` from its environment, and redacts inherited variables that look like secrets
 * unless `env` lists them, which it always does here.
 */
const renderMcpServer = (n: string, block: Record<string, unknown>): Rendered => {
  const value: Record<string, unknown> = {};
  if (block.transport === "http") {
    value.httpUrl = block.url;
    const headers = Object.entries(record(block.headers));
    if (headers.length) value.headers = Object.fromEntries(headers.map(([k, v]) => [k, String(v)]));
  } else {
    value.command = block.command;
    if (Array.isArray(block.args) && block.args.length) value.args = block.args;
  }
  const env = (Array.isArray(block.env) ? block.env : [])
    .map((v) => String(record(v).name ?? ""))
    .filter((name) => name);
  if (env.length && block.transport !== "http")
    value.env = Object.fromEntries(env.map((name) => [name, envRef(name, "json-template")]));
  return {
    changes: [{ kind: "json-key", path: SETTINGS, key: ["mcpServers", n], value }],
    warnings: [],
  };
};

/** One policy rule's TOML lines, or null when Gemini CLI's policy engine can't say it. */
const policyRule = (
  tool: string,
  pattern: string | undefined,
  decision: string,
): string[] | null => {
  const verdict = own(DECISIONS, decision);
  const priority = own(PRIORITIES, decision);
  if (!verdict || priority === undefined) return null;
  // A control character or a lone surrogate isn't a command anyone types, and TOML can't hold one.
  if (
    pattern !== undefined &&
    ([...pattern].some((char) => (char.codePointAt(0) ?? 0) < 0x20 || char === "\u007f") ||
      wellFormed(pattern) !== pattern)
  )
    return null;
  const tail = [
    `decision = ${tomlString(verdict)}`,
    `priority = ${priority}`,
    ...(decision === "deny" ? [] : [`modes = ${JSON.stringify(LOOSER_MODES)}`]),
  ];
  const mcp = /^mcp:([^/]+)(?:\/(.+))?$/.exec(tool);
  if (mcp) {
    if (pattern !== undefined || !toolOf(tool)) return null;
    return [
      `mcpName = ${tomlString(mcp[1] ?? "")}`,
      `toolName = ${tomlString(mcp[2] ?? "*")}`,
      ...tail,
    ];
  }
  const name = own(TOOLS, tool);
  const names = namesOf(tool);
  if (!name || !names) return null;
  const all = names.length > 1 ? `[${names.map(tomlString).join(", ")}]` : tomlString(name);
  if (pattern === undefined) return [`toolName = ${all}`, ...tail];
  if (tool !== "shell") return null;
  // `commandPrefix` is a prefix: a pattern's trailing `*` is dropped, one anywhere else can't be said.
  const prefix = pattern.endsWith("*") ? pattern.slice(0, -1).trimEnd() : pattern;
  if (prefix.includes("*")) return null;
  if (!prefix) return [`toolName = ${tomlString(name)}`, ...tail];
  if (prefix !== pattern)
    return [`toolName = ${tomlString(name)}`, `commandPrefix = ${tomlString(prefix)}`, ...tail];
  // No `*`: that command exactly. The CLI 0.70.0 matches `commandRegex` from the command's opening
  // quote in its JSON arguments, so the closing quote ends the match (`git status` doesn't cover
  // `git status; rm …`).
  return [
    `toolName = ${tomlString(name)}`,
    `commandRegex = ${tomlString(`${escapeRegex(JSON.stringify(pattern).slice(1, -1))}"`)}`,
    ...tail,
  ];
};

/** A string as a regular expression that matches only itself. */
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `~/.gemini/policies/<n>.toml` (degraded, home folder only: the project tier is "currently
 * non-functional", issue #18186), one `[[rule]]` per rule, with the marker as a `#` comment.
 */
const renderPermissionPolicy = (
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
          message: `Gemini CLI's project policies don't work yet, so ${item.name} was skipped; install it with --scope user.`,
        },
      ],
    };
  const warnings: RenderWarning[] = [];
  const rules: string[] = [];
  for (const raw of Array.isArray(block.rules) ? block.rules : []) {
    const rule = record(raw);
    const tool = String(rule.tool ?? "");
    const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
    const lines = policyRule(tool, pattern, String(rule.decision));
    if (lines) rules.push(`[[rule]]\n${lines.join("\n")}\n`);
    else
      warnings.push(
        unsupported(
          `Gemini CLI can't express the rule for \`${tool}\`${pattern ? ` \`${pattern}\`` : ""} in ${item.name}, so it was left out.`,
        ),
      );
  }
  if (!rules.length) return { changes: [], warnings };
  return {
    changes: [
      {
        kind: "file",
        path: `.gemini/policies/${n}.toml`,
        content: `${managedMarker(item.name, item.version, "hash")}\n\n${rules.join("\n")}`,
      },
    ],
    warnings,
  };
};

const NO_PLACE: Partial<Record<ItemType, string>> = {
  statusline: "Gemini CLI has no status line command, only footer settings",
  "output-style": "Gemini CLI has no output styles",
  "lsp-server": "Gemini CLI takes no language servers",
};

export const geminiRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: async (probe) => (await probe.exists(".gemini")) || (await probe.exists("GEMINI.md")),
  supports: (type) => {
    switch (type) {
      case "statusline":
      case "output-style":
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
        return skillFolder(item, n, String(block.entry ?? "SKILL.md"), SKILLS);
      case "agent":
        return renderAgent(item, n, block, targets.overrides);
      case "rule":
        return renderRule(item, n, block, scope);
      case "command":
        return renderCommand(item, n, block);
      case "hook":
        return renderHook(item, n, block, scope);
      case "mcp-server":
        return renderMcpServer(n, block);
      case "permission-policy":
        return renderPermissionPolicy(item, n, block, scope);
      case "statusline":
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
              message: `${item.name} (${String(type)}) isn't rendered for Gemini CLI yet.`,
            },
          ],
        };
    }
  },
};
