import type { ItemType } from "@ronneai/core";

export type TypeGroup = "guidance" | "runtime" | "bundles";

/** The type picker's filter chips (feature 012), in order; their names are `types.group.<id>`. */
export const TYPE_GROUPS: { id: TypeGroup }[] = [
  { id: "guidance" },
  { id: "runtime" },
  { id: "bundles" },
];

/**
 * What each type is, in one line (MVP §3.1), as a short tag and a group for the type picker. Its
 * name for people ("MCP server" for `mcp-server`) and its one-line description are messages
 * (`types.name.<type>`, `types.description.<type>`; feature 130).
 * `highRisk` types run programs or change what the agent may do: reviewers see a risk flag (014).
 */
export const TYPE_INFO: Record<ItemType, { tag: string; group: TypeGroup; highRisk?: true }> = {
  skill: {
    tag: "agent skills",
    group: "guidance",
  },
  agent: {
    tag: "sub-agent",
    group: "guidance",
  },
  rule: {
    tag: "guidance",
    group: "guidance",
  },
  command: {
    tag: "prompt",
    group: "guidance",
  },
  "output-style": {
    tag: "style",
    group: "guidance",
  },
  hook: {
    tag: "lifecycle",
    group: "runtime",
    highRisk: true,
  },
  "mcp-server": {
    tag: "connection",
    group: "runtime",
    highRisk: true,
  },
  "permission-policy": {
    tag: "security",
    group: "runtime",
    highRisk: true,
  },
  statusline: {
    tag: "script",
    group: "runtime",
    highRisk: true,
  },
  "lsp-server": {
    tag: "language",
    group: "runtime",
    highRisk: true,
  },
  bundle: {
    tag: "composite",
    group: "bundles",
  },
};

export const HIGH_RISK_NOTE =
  "It runs programs or changes what the agent may do, so reviewers see a risk flag.";
export const STANDARD_RISK_NOTE =
  "It doesn't run programs or change permissions, so reviewers see no risk flag.";
