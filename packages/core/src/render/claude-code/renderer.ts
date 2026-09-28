import { type ItemType, isItemType } from "../../item-types.js";
import type { PackageFile } from "../../package-file.js";
import { disabledWarning, managedMarker, targetsFor, toolName } from "../helpers.js";
import type {
  Change,
  ChangeFile,
  PlatformRenderer,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import { MODELS, TOOLS } from "./mappings.js";

/**
 * The Claude Code renderer (feature 023). Where Claude Code reads each type was checked against
 * its documentation on 2026-09-28 (spec 023); project and user scope share the `.claude/` layout,
 * relative to the project or the home folder. Rules go to `.claude/rules/`, which Claude Code
 * always reads; `CLAUDE.md` and `AGENTS.md` are never written.
 */
export const RENDERER_ID = "claude-code";
export const RENDERER_NAME = "Claude Code";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const shortName = (name: string) => name.slice(name.indexOf("/") + 1);
const decoder = new TextDecoder();
const fileText = (files: readonly PackageFile[], path: unknown): string => {
  const file = typeof path === "string" ? files.find((f) => f.path === path) : undefined;
  return file ? decoder.decode(file.bytes) : "";
};

/** A YAML frontmatter value: quoted when it could read as something else. */
const yamlValue = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9_ .,()'-]*$/.test(value) && !/^(true|false|null|yes|no)$/i.test(value)
    ? value
    : JSON.stringify(value);

/** `---` on line 1 (Claude Code skips a file otherwise), then the managed marker, then the body. */
const markdown = (
  item: RenderInput,
  front: [string, string | string[] | boolean][],
  body: string,
): string => {
  const lines = front.map(([key, value]) =>
    Array.isArray(value)
      ? `${key}:\n${value.map((v) => `  - ${yamlValue(v)}`).join("\n")}`
      : `${key}: ${typeof value === "boolean" ? String(value) : yamlValue(value)}`,
  );
  const head = lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
  return `${head}${managedMarker(item.name, item.version, "html")}\n\n${body.replace(/\n+$/, "")}\n`;
};

const skillFiles = (item: RenderInput, entry: string): ChangeFile[] =>
  item.files.map((file) => ({
    path: file.path === entry ? "SKILL.md" : file.path,
    content: file.bytes,
    executable: file.executable,
  }));

/** A skill written from a rule or a command, which Claude Code merged into skills. */
const skillOf = (
  item: RenderInput,
  n: string,
  front: [string, string | string[] | boolean][],
  body: string,
): Change => ({
  kind: "dir",
  path: `.claude/skills/${n}`,
  files: [{ path: "SKILL.md", content: markdown(item, [["name", n], ...front], body) }],
});

type Rendered = { changes: Change[]; warnings: RenderWarning[] };

const renderSkill = (item: RenderInput, n: string, block: Record<string, unknown>): Rendered => ({
  changes: [
    {
      kind: "dir",
      path: `.claude/skills/${n}`,
      files: skillFiles(item, String(block.entry ?? "SKILL.md")),
    },
  ],
  warnings: [],
});

const renderAgent = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Rendered => {
  const warnings: RenderWarning[] = [];
  const tools: string[] = [];
  for (const tool of strings(block.tools)) {
    const mapped = toolName(tool, TOOLS);
    if ("name" in mapped) tools.push(mapped.name);
    else warnings.push(mapped.warning);
  }
  const front: [string, string | string[] | boolean][] = [
    ["name", n],
    ["description", String(item.manifest.description ?? "")],
  ];
  if (tools.length) front.push(["tools", tools.join(", ")]);
  const model =
    typeof overrides.model === "string"
      ? overrides.model
      : MODELS[String(block.model ?? "default")];
  if (model) front.push(["model", model]);
  for (const key of Object.keys(overrides))
    if (key !== "model")
      warnings.push({
        code: "invalid_override",
        message: `Claude Code takes no override \`${key}\` for an agent; only \`model\`.`,
      });
  return {
    changes: [
      {
        kind: "file",
        path: `.claude/agents/${n}.md`,
        content: markdown(item, front, fileText(item.files, block.prompt)),
      },
    ],
    warnings,
  };
};

const renderRule = (item: RenderInput, n: string, block: Record<string, unknown>): Rendered => {
  const body = fileText(item.files, block.body);
  const description = String(item.manifest.description ?? "");
  switch (String(block.activation ?? "always")) {
    case "glob":
      return {
        changes: [
          {
            kind: "file",
            path: `.claude/rules/${n}.md`,
            content: markdown(item, [["paths", strings(block.globs)]], body),
          },
        ],
        warnings: [],
      };
    case "model":
      return { changes: [skillOf(item, n, [["description", description]], body)], warnings: [] };
    case "manual":
      return {
        changes: [
          skillOf(
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
    default:
      return {
        changes: [
          { kind: "file", path: `.claude/rules/${n}.md`, content: markdown(item, [], body) },
        ],
        warnings: [],
      };
  }
};

const renderCommand = (item: RenderInput, n: string, block: Record<string, unknown>): Rendered => {
  const args = (Array.isArray(block.args) ? block.args : []).map(record);
  const names = args.map((arg) => String(arg.name ?? ""));
  const hint = args.map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`)).join(" ");
  const front: [string, string | string[] | boolean][] = [
    ["description", String(item.manifest.description ?? "")],
  ];
  if (hint) front.push(["argument-hint", hint]);
  if (names.length) front.push(["arguments", names]);
  front.push(["disable-model-invocation", true]);
  // `$ARGUMENTS` is Claude Code's own; `{{name}}` becomes its named form.
  const body = fileText(item.files, block.body).replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    "$$$1",
  );
  return { changes: [skillOf(item, n, front, body)], warnings: [] };
};

const renderOutputStyle = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
): Rendered => ({
  changes: [
    {
      kind: "file",
      path: `.claude/output-styles/${n}.md`,
      content: markdown(
        item,
        [
          ["name", n],
          ["description", String(item.manifest.description ?? "")],
        ],
        fileText(item.files, block.body),
      ),
    },
  ],
  warnings: [],
});

export const claudeCodeRenderer: PlatformRenderer = {
  id: RENDERER_ID,
  name: RENDERER_NAME,
  version: "1.0.0",
  detect: async (probe) => (await probe.exists(".claude")) || probe.exists("CLAUDE.md"),
  supports: (type) => (type === "lsp-server" ? "degraded" : "native"),
  render(item, context) {
    const targets = targetsFor(item.manifest, RENDERER_ID);
    if (!targets.enabled)
      return { changes: [], warnings: [disabledWarning(item.name, RENDERER_NAME)] };
    const type = isItemType(String(item.manifest.type)) ? (item.manifest.type as ItemType) : null;
    const block = record(type ? item.manifest[type] : undefined);
    const n = shortName(item.name);
    const scope: RenderScope = context.scope;
    void scope;
    switch (type) {
      case "skill":
        return renderSkill(item, n, block);
      case "agent":
        return renderAgent(item, n, block, targets.overrides);
      case "rule":
        return renderRule(item, n, block);
      case "command":
        return renderCommand(item, n, block);
      case "output-style":
        return renderOutputStyle(item, n, block);
      default:
        return {
          changes: [],
          warnings: [
            {
              code: "unsupported_type",
              message: `${item.name} (${String(type)}) isn't rendered for Claude Code yet.`,
            },
          ],
        };
    }
  },
};
