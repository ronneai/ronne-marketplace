import { readMcpServer } from "../claude-code/mcp-server.js";
import { ReadError, type ReadResult } from "../types.js";

/**
 * An Antigravity MCP server (`mcpServers.<n>` in `.agents/mcp_config.json` or
 * `~/.gemini/config/mcp_config.json`) as an item (native-readers.md §13), through the Claude Code
 * reader's rules, so no value of `env` is ever read into the item and a literal credential in a
 * header, an argument or the address is replaced by a declared variable. Antigravity's own
 * examples put a literal token in `env`, which those rules keep out. `serverUrl` (or `url`) is an
 * http server.
 */
export const readAntigravityMcpServer = (
  key: string,
  value: unknown,
  options: { itemName: string; description?: string; where?: string },
): ReadResult => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't an object.`);
  const { serverUrl, url, ...rest } = value as Record<string, unknown>;
  const address = serverUrl ?? url;
  const config: Record<string, unknown> =
    address !== undefined ? { type: "http", url: address, ...rest } : { type: "stdio", ...rest };
  return readMcpServer(key, config, { ...options, where: options.where ?? `mcpServers.${key}` });
};
