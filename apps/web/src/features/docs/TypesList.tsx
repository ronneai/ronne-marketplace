import type { ItemType } from "@ronneai/core";
import { RENDERERS } from "@ronneai/core/render";
import { docsHref, type TopicSlug } from "@/components/help/topics";
import { TYPE_INFO } from "@/components/submissions/item-types";
import { TypesExplorer } from "./TypesExplorer";
import { shortPlace, TOOL_PATHS } from "./tool-paths";
import type { TypeGroup, TypeRow } from "./types";

/**
 * The 11 types (feature 033, laid out after the owner's mockup in 025): in four groups, each row
 * with what the type is and, per AI tool, whether it takes it (each renderer's own `supports()`)
 * and where it goes, linking to the tool's page for the whole story.
 */
const GROUPS: { id: string; title: string; chip: string; types: ItemType[] }[] = [
  {
    id: "core",
    title: "Core AI capabilities",
    chip: "Core capabilities",
    types: ["skill", "agent", "rule", "command", "bundle"],
  },
  {
    id: "integrations",
    title: "System and tool integrations",
    chip: "Integrations",
    types: ["mcp-server", "lsp-server"],
  },
  {
    id: "guardrails",
    title: "Security and policy guardrails",
    chip: "Guardrails",
    types: ["hook", "permission-policy"],
  },
  {
    id: "environment",
    title: "Environment and interface",
    chip: "Environment",
    types: ["output-style", "statusline"],
  },
];

const TOOL_PAGES: Record<string, TopicSlug> = {
  "claude-code": "claude-code",
  codex: "codex",
  cursor: "cursor",
};

const row = (type: ItemType): TypeRow => ({
  type,
  description: TYPE_INFO[type].description,
  highRisk: TYPE_INFO[type].highRisk === true,
  tools: RENDERERS.filter((renderer) => renderer.id in TOOL_PAGES).map((renderer) => {
    const level = renderer.supports(type);
    const where = TOOL_PATHS[renderer.id]?.find(([t]) => t === type)?.[1] ?? "";
    return {
      id: renderer.id,
      name: renderer.name,
      href: docsHref(TOOL_PAGES[renderer.id] as TopicSlug, "paths"),
      level,
      place:
        level === "none" ? "Skipped" : type === "bundle" ? "installs its items" : shortPlace(where),
    };
  }),
});

export const TypesList = () => {
  const groups: TypeGroup[] = GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    chip: group.chip,
    rows: group.types.map(row),
  }));
  return <TypesExplorer groups={groups} />;
};
