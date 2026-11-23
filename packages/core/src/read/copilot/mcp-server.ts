import { readMcpServer } from "../claude-code/mcp-server.js";
import { ReadError, type ReadResult } from "../types.js";

/**
 * A Copilot MCP server (`mcpServers.<n>` in `.github/mcp.json` or `~/.copilot/mcp-config.json`) as
 * an item (native-readers.md §11), through the Claude Code reader's rules: Copilot's `${VAR}` is the
 * manifest's syntax already. `type: "local"` is a stdio server, and `tools`, which picks the
 * server's tools Copilot may call, has no place in an item: every tool is offered.
 */
export const readCopilotMcpServer = (
  key: string,
  value: unknown,
  options: { itemName: string; description?: string; where?: string },
): ReadResult => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't an object.`);
  const { tools, ...config } = value as Record<string, unknown>;
  if (config.type === "local") config.type = "stdio";
  const read = readMcpServer(key, config, {
    ...options,
    where: options.where ?? `mcpServers.${key}`,
  });
  const picked = Array.isArray(tools) && !(tools.length === 1 && tools[0] === "*");
  return picked
    ? {
        ...read,
        warnings: [
          {
            code: "field_dropped",
            message: `mcpServers.${key} lets Copilot call only some of its tools; an item offers all of them, so \`tools\` was left out.`,
          },
          ...read.warnings,
        ],
      }
    : read;
};
