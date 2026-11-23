import { type ItemType, isItemType } from "../../item-types.js";
import { skillFolder, writtenSkill } from "../agents-skills.js";
import { tomlString, tomlText } from "../codex/toml.js";
import {
  disabledWarning,
  type Frontmatter,
  fileText,
  frontmatterMarkdown,
  managedMarker,
  record,
  shortName,
  strings,
  targetsFor,
  trimTrailingNewlines,
} from "../helpers.js";
import type {
  Change,
  PlatformRenderer,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import { toolOf } from "./mappings.js";

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
    const name = toolOf(canonical);
    if (name) {
      if (!tools.includes(name)) tools.push(name);
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
