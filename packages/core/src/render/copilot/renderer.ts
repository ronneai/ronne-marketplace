import { type ItemType, isItemType } from "../../item-types.js";
import { commandSkill, type SkillPlace, skillFolder, writtenSkill } from "../agents-skills.js";
import {
  disabledWarning,
  type Frontmatter,
  fileText,
  frontmatterMarkdown,
  record,
  shortName,
  strings,
  targetsFor,
  toolName,
} from "../helpers.js";
import type {
  Change,
  PlatformRenderer,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
import { AGENT_TOOLS } from "./mappings.js";

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
 * Instructions files apply by path, so `always` and `glob` rules are instructions, and `model` and
 * `manual` rules, which the model picks or a person asks for, are skills, as in Codex (024).
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
    default: {
      const globs = String(block.activation) === "glob" ? strings(block.globs).join(",") : "**";
      return {
        changes: [
          {
            kind: "file",
            path: `${home(scope)}/instructions/${n}.instructions.md`,
            content: frontmatterMarkdown(item, [["applyTo", globs]], body),
          },
        ],
        warnings: [],
      };
    }
  }
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
