import type { ToolTable } from "../helpers.js";

/**
 * Copilot's names for the canonical ones (manifest spec §5, MVP §3.1), checked 2026-11-22 against
 * docs.github.com's custom agents configuration. An agent's `tools` take Copilot's aliases, which
 * the CLI, VS Code and the cloud agent all read; several canonical tools share one alias.
 */
export const AGENT_TOOLS: ToolTable = {
  names: {
    read: "read",
    edit: "edit",
    write: "edit",
    grep: "search",
    glob: "search",
    shell: "execute",
    "web-fetch": "web",
    "web-search": "web",
  },
  mcp: (server, tool) => `${server}/${tool ?? "*"}`,
};
