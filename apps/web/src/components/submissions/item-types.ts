import type { ItemType } from "@ronneai/core";

export type TypeGroup = "guidance" | "runtime" | "bundles";

/** The type picker's filter chips (feature 012), in order; their names are `types.group.<id>`. */
export const TYPE_GROUPS: { id: TypeGroup }[] = [
  { id: "guidance" },
  { id: "runtime" },
  { id: "bundles" },
];

/**
 * What each type is (MVP §3.1): its group for the type picker. Its name for people ("MCP server" for
 * `mcp-server`), its one-line description and its short tag are messages (`types.name.<type>`,
 * `types.description.<type>`, feature 130; `types.tag.<type>`, 131).
 * `highRisk` types run programs or change what the agent may do: reviewers see a risk flag (014).
 */
export const TYPE_INFO: Record<ItemType, { group: TypeGroup; highRisk?: true }> = {
  skill: {
    group: "guidance",
  },
  agent: {
    group: "guidance",
  },
  rule: {
    group: "guidance",
  },
  command: {
    group: "guidance",
  },
  "output-style": {
    group: "guidance",
  },
  hook: {
    group: "runtime",
    highRisk: true,
  },
  "mcp-server": {
    group: "runtime",
    highRisk: true,
  },
  "permission-policy": {
    group: "runtime",
    highRisk: true,
  },
  statusline: {
    group: "runtime",
    highRisk: true,
  },
  "lsp-server": {
    group: "runtime",
    highRisk: true,
  },
  bundle: {
    group: "bundles",
  },
};
