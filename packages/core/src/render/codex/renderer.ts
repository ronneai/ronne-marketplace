import { type ItemType, isItemType } from "../../item-types.js";
import { commandSkill, skillFolder, writtenSkill } from "../agents-skills.js";
import {
  disabledWarning,
  fileText,
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
import { DECISIONS, EVENTS } from "./mappings.js";
import { tomlString, tomlText } from "./toml.js";

/**
 * The Codex renderer (feature 024). Where Codex reads each type was checked against its
 * documentation on 2026-09-28 (spec 024). Skills and commands go to the cross-tool
 * `.agents/skills/`, shared with Cursor; everything else to `.codex/`, or `AGENTS.md` for rules.
 * Paths are relative to the project, or to the home folder in user scope.
 */
export const RENDERER_ID = "codex";
export const RENDERER_NAME = "Codex";

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const unsupported = (message: string): RenderWarning => ({ code: "unsupported_field", message });

/** Codex's instructions file: `AGENTS.md` at the project root, or `~/.codex/AGENTS.md`. */
const agentsMd = (scope: RenderScope) => (scope === "project" ? "AGENTS.md" : ".codex/AGENTS.md");

const renderAgent = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  if (strings(block.tools).length)
    warnings.push(
      unsupported(
        `Codex agents have no tool list, so ${item.name}'s tools were left out: it gets the session's tools.`,
      ),
    );
  const model = typeof overrides.model === "string" ? overrides.model : undefined;
  if (!model && block.model !== undefined && block.model !== "default")
    warnings.push(
      unsupported(
        `Codex has no model for the \`${String(block.model)}\` hint, so ${item.name} uses the session's model; set targets.codex.overrides.model to choose one.`,
      ),
    );
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Codex takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  const lines = [
    managedMarker(item.name, item.version, "hash"),
    `name = ${tomlString(n)}`,
    `description = ${tomlString(String(item.manifest.description ?? ""))}`,
  ];
  if (model) lines.push(`model = ${tomlString(model)}`);
  lines.push(
    `developer_instructions = ${tomlText(`${trimTrailingNewlines(fileText(item.files, block.prompt))}\n`)}`,
  );
  return {
    changes: [{ kind: "file", path: `.codex/agents/${n}.toml`, content: `${lines.join("\n")}\n` }],
    warnings,
  };
};

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
      // Codex has no per-file instructions: the section says which files it's for.
      const globs = strings(block.globs).map((glob) => `\`${glob}\``);
      const scopeLine = `These rules apply to files matching ${globs.join(", ")}.\n\n`;
      return {
        changes: [
          { kind: "section", path: agentsMd(scope), key: item.name, text: `${scopeLine}${body}` },
        ],
        warnings: [],
      };
    }
    default:
      return {
        changes: [{ kind: "section", path: agentsMd(scope), key: item.name, text: body }],
        warnings: [],
      };
  }
};

/** Codex's hooks file, in both scopes. */
const HOOKS = ".codex/hooks.json";

/**
 * Where a script rmk wrote can be run from. Codex finds project hooks at the repository root, and
 * documents no variable for it, so the command asks git.
 */
const scriptPath = (scope: RenderScope, path: string) =>
  scope === "project" ? `"$(git rev-parse --show-toplevel)"/${path}` : `"$HOME"/${path}`;

const renderHook = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  scope: RenderScope,
): Rendered => {
  const event = EVENTS[String(block.event)];
  if (!event)
    return {
      changes: [],
      warnings: [
        unsupported(
          `Codex has no event for \`${String(block.event)}\`, so ${item.name} was left out.`,
        ),
      ],
    };
  const warnings: RenderWarning[] = [];
  const changes: Change[] = [];
  const run = record(block.run);
  let command = typeof run.command === "string" ? run.command : "";
  if (typeof run.script === "string") {
    const path = `.codex/hooks/${n}/${run.script}`;
    changes.push({
      kind: "file",
      path,
      content: withHashMarker(item, fileText(item.files, run.script)),
      executable: true,
    });
    command = scriptPath(scope, path);
  } else if (/\$RMK_[A-Z_]+/.test(command))
    warnings.push(
      unsupported(
        `${item.name}'s command uses an $RMK_ variable; Codex passes the event as JSON on stdin instead, so the hook has to read it from there.`,
      ),
    );
  if (record(block.matcher).tool !== undefined)
    warnings.push(
      unsupported(
        `Codex's tool names aren't documented, so ${item.name} runs for every tool instead of only \`${String(record(block.matcher).tool)}\`; it can check the tool in the event it reads on stdin.`,
      ),
    );
  const handler: Record<string, unknown> = { type: "command", command };
  if (typeof block.timeout === "number") handler.timeout = block.timeout;
  changes.push({
    kind: "json-array-item",
    path: HOOKS,
    key: ["hooks", event],
    item: { hooks: [handler] },
  });
  return { changes, warnings };
};

/** `${NAME}` alone, as a header's whole value. */
const wholeRef = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const bearerRef = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * `[mcp_servers.<n>]` in `config.toml`. Codex takes secrets by the variable's name, never as a
 * `${NAME}` inside a value, so each header becomes the field that says it that way.
 */
const renderMcpServer = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const value: Record<string, unknown> = {};
  if (block.transport === "http") {
    value.url = block.url;
    const literal: Record<string, string> = {};
    const fromEnv: Record<string, string> = {};
    for (const [header, raw] of Object.entries(record(block.headers))) {
      const text = String(raw);
      const bearer = bearerRef.exec(text);
      const whole = wholeRef.exec(text);
      if (bearer && header.toLowerCase() === "authorization")
        value.bearer_token_env_var = bearer[1];
      else if (whole?.[1]) fromEnv[header] = whole[1];
      else if (!text.includes("${")) literal[header] = text;
      else
        warnings.push(
          unsupported(
            `Codex can't build the \`${header}\` header of ${item.name} from a variable inside other text, so it was left out.`,
          ),
        );
    }
    if (Object.keys(literal).length) value.http_headers = literal;
    if (Object.keys(fromEnv).length) value.env_http_headers = fromEnv;
  } else {
    value.command = block.command;
    if (Array.isArray(block.args)) value.args = block.args;
    const names = (Array.isArray(block.env) ? block.env : [])
      .map((v) => String(record(v).name ?? ""))
      .filter((name) => name);
    if (names.length) value.env_vars = names;
  }
  return {
    changes: [{ kind: "toml-key", path: ".codex/config.toml", key: ["mcp_servers", n], value }],
    warnings,
  };
};

/** A shell pattern as `prefix_rule`'s words, or null when it isn't a plain prefix. */
const prefixWords = (pattern: string): string[] | null => {
  const words = pattern.trim().split(/\s+/);
  const last = words.at(-1) ?? "";
  if (last === "*") words.pop();
  else if (last.endsWith("*")) words[words.length - 1] = last.slice(0, -1);
  return words.length && words.every((word) => word && !/[*?[\]]/.test(word)) ? words : null;
};

/**
 * `.codex/rules/<n>.rules` (degraded): Codex's rules are Starlark `prefix_rule`s over shell
 * commands, so only shell rules with a prefix pattern can be said.
 */
const renderPermissionPolicy = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const lines: string[] = [];
  for (const raw of Array.isArray(block.rules) ? block.rules : []) {
    const rule = record(raw);
    const tool = String(rule.tool ?? "");
    const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
    const decision = DECISIONS[String(rule.decision)];
    const words = tool === "shell" && pattern !== undefined ? prefixWords(pattern) : null;
    if (!words || !decision) {
      warnings.push(
        unsupported(
          `Codex's rules only cover shell commands by their first words, so the rule for \`${tool}\`${pattern ? ` \`${pattern}\`` : ""} in ${item.name} was left out.`,
        ),
      );
      continue;
    }
    // `push*` means `push`; `--force*` also meant `--force-with-lease`, which a word can't say.
    if (/(^|\s)-[^\s*]*\*$/.test(pattern ?? ""))
      warnings.push(
        unsupported(
          `Codex matches whole words, so \`${pattern}\` in ${item.name} became \`${words.join(" ")}\`: \`${words.at(-1)}\` no longer covers longer options that start the same way.`,
        ),
      );
    lines.push(
      `prefix_rule(pattern = [${words.map((word) => JSON.stringify(word)).join(", ")}], decision = ${JSON.stringify(decision)})`,
    );
  }
  if (!lines.length) return { changes: [], warnings };
  return {
    changes: [
      {
        kind: "file",
        path: `.codex/rules/${n}.rules`,
        content: `${managedMarker(item.name, item.version, "hash")}\n${lines.join("\n")}\n`,
      },
    ],
    warnings,
  };
};

export const codexRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: (probe) => probe.exists(".codex"),
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
        return {
          changes: [skillFolder(item, n, String(block.entry ?? "SKILL.md"))],
          warnings: [],
        };
      case "agent":
        return renderAgent(item, n, block, targets.overrides);
      case "rule":
        return renderRule(item, n, block, scope);
      case "command": {
        const { change, warnings } = commandSkill(item, n, block);
        return { changes: [change], warnings };
      }
      case "hook":
        return renderHook(item, n, block, scope);
      case "mcp-server":
        return renderMcpServer(item, n, block);
      case "permission-policy":
        return renderPermissionPolicy(item, n, block);
      case "output-style":
      case "statusline":
      case "lsp-server":
        // `rmk` skips these before rendering (`supports` says none); said here for the goldens.
        return {
          changes: [],
          warnings: [
            {
              code: "unsupported_type",
              message: `Codex has no place for ${item.name} (${type}), so it was skipped there.`,
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
              message: `${item.name} (${String(type)}) isn't rendered for Codex yet.`,
            },
          ],
        };
    }
  },
};
