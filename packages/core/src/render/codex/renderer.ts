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
} from "../helpers.js";
import type {
  Change,
  PlatformRenderer,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";
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
