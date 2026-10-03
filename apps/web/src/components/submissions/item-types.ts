import type { ItemType } from "@ronneai/core";

export type TypeGroup = "guidance" | "runtime" | "bundles";

/** The type picker's filter chips (feature 012), in order. */
export const TYPE_GROUPS: { id: TypeGroup; label: string }[] = [
  { id: "guidance", label: "Guidance" },
  { id: "runtime", label: "Runtime & tools" },
  { id: "bundles", label: "Bundles" },
];

/**
 * What each type is, in one line (MVP §3.1), with its name for people (`label`: "MCP server" for
 * `mcp-server`, used by the catalogue's type filter), a short tag and a group for the type picker.
 * `highRisk` types run programs or change what the agent may do: reviewers see a risk flag (014).
 */
export const TYPE_INFO: Record<
  ItemType,
  { label: string; description: string; tag: string; group: TypeGroup; highRisk?: true }
> = {
  skill: {
    label: "Skill",
    description:
      "Instructions (SKILL.md), with optional scripts and files, that the AI loads when a task needs them.",
    tag: "agent skills",
    group: "guidance",
  },
  agent: {
    label: "Agent",
    description: "A sub-agent with its own prompt, allowed tools and model.",
    tag: "sub-agent",
    group: "guidance",
  },
  rule: {
    label: "Rule",
    description:
      "Guidance that applies always, to matching files, when the AI decides, or on request.",
    tag: "guidance",
    group: "guidance",
  },
  command: {
    label: "Command",
    description: "A reusable prompt or slash command, with arguments.",
    tag: "prompt",
    group: "guidance",
  },
  "output-style": {
    label: "Output style",
    description: "Changes how the agent writes its answers.",
    tag: "style",
    group: "guidance",
  },
  hook: {
    label: "Hook",
    description: "A command that runs on an AI tool's event, such as tool.after or session.start.",
    tag: "lifecycle",
    group: "runtime",
    highRisk: true,
  },
  "mcp-server": {
    label: "MCP server",
    description: "The connection to an MCP server: a program to start, or a URL.",
    tag: "connection",
    group: "runtime",
    highRisk: true,
  },
  "permission-policy": {
    label: "Permission policy",
    description: "Allow, ask or deny rules for tools and shell commands.",
    tag: "security",
    group: "runtime",
    highRisk: true,
  },
  statusline: {
    label: "Status line",
    description: "A script that prints the AI tool's status line.",
    tag: "script",
    group: "runtime",
    highRisk: true,
  },
  "lsp-server": {
    label: "LSP server",
    description: "A language server that gives the agent code intelligence.",
    tag: "language",
    group: "runtime",
    highRisk: true,
  },
  bundle: {
    label: "Bundle",
    description: "A set of items installed together, as one.",
    tag: "composite",
    group: "bundles",
  },
};

export const HIGH_RISK_NOTE =
  "It runs programs or changes what the agent may do, so reviewers see a risk flag.";
export const STANDARD_RISK_NOTE =
  "It doesn't run programs or change permissions, so reviewers see no risk flag.";
