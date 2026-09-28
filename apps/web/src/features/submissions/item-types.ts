import type { ItemType } from "@ronneai/core";

/** What each type is, in one line (MVP §3.1), for the type picker and badges. */
export const TYPE_INFO: Record<ItemType, { description: string; highRisk?: true }> = {
  skill: {
    description:
      "Instructions, with optional scripts and files, that the AI loads when a task needs them.",
  },
  agent: { description: "A sub-agent with its own prompt, tools and model." },
  rule: {
    description:
      "Guidance that applies always, to matching files, when the AI decides, or on request.",
  },
  command: { description: "A reusable prompt or slash command, with arguments." },
  hook: {
    description: "A command that runs on an AI tool's event, such as after an edit.",
    highRisk: true,
  },
  "mcp-server": {
    description: "The connection to an MCP server: a program to start, or a URL.",
    highRisk: true,
  },
  "permission-policy": {
    description: "Allow, ask or deny rules for tools and shell commands.",
    highRisk: true,
  },
  "output-style": { description: "Changes how the agent writes its answers." },
  statusline: { description: "A script that prints the AI tool's status line.", highRisk: true },
  "lsp-server": {
    description: "A language server that gives the agent code intelligence.",
    highRisk: true,
  },
  bundle: { description: "A set of items installed together." },
};

export const HIGH_RISK_NOTE =
  "It runs programs or changes what the agent may do, so reviewers see a risk flag.";
