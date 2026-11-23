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
} from "../helpers.js";
import type {
  Change,
  PlatformRenderer,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import { MODELS, toolOf } from "./mappings.js";

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
