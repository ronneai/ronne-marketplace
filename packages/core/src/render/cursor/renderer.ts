import { type ItemType, isItemType } from "../../item-types.js";
import { commandSkill, skillFolder } from "../agents-skills.js";
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
  RenderContext,
  RenderInput,
  RenderScope,
  RenderWarning,
} from "../types.js";

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
