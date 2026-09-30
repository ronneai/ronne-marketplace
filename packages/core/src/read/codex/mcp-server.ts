import { readMcpServer } from "../claude-code/mcp-server.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/** The keys a Codex server keeps; everything else is dropped with a warning. */
const KEPT = [
  "command",
  "args",
  "env",
  "env_vars",
  "url",
  "bearer_token_env_var",
  "http_headers",
  "env_http_headers",
  "enabled",
];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * A Codex MCP server (`[mcp_servers.<n>]`, parsed) as an item (native-readers.md §9). Its keys are
 * put in the shape Claude Code's reader takes, so the same rules keep every value out: variables
 * by name only, and literal credentials replaced by declared variables.
 */
export const readCodexMcpServer = (
  key: string,
  value: unknown,
  options: { itemName: string; description?: string },
): ReadResult => {
  const where = `mcp_servers.${key}`;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't a TOML table.`);
  const config = record(value);
  const warnings: ReadWarning[] = [];
  const env: Record<string, string> = {};
  let shaped: Record<string, unknown>;

  if (typeof config.url === "string") {
    const headers: Record<string, string> = {};
    const bearer =
      typeof config.bearer_token_env_var === "string" ? config.bearer_token_env_var : null;
    for (const [header, text] of Object.entries(record(config.http_headers))) {
      if (bearer && header.toLowerCase() === "authorization") {
        warnings.push({
          code: "field_dropped",
          message: `${where}'s literal Authorization header was left out (and isn't uploaded): bearer_token_env_var gives it.`,
        });
        continue;
      }
      headers[header] = String(text);
    }
    for (const [header, variable] of Object.entries(record(config.env_http_headers))) {
      headers[header] = `\${${String(variable)}}`;
      env[String(variable)] = `\${${String(variable)}}`;
    }
    if (bearer) {
      headers.Authorization = `Bearer \${${bearer}}`;
      env[bearer] = `\${${bearer}}`;
    }
    shaped = {
      type: "http",
      url: config.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  } else {
    // env's values are passed on only so the reader can tell a secret; they're never in the item.
    for (const [name, text] of Object.entries(record(config.env))) env[name] = String(text);
    for (const entry of Array.isArray(config.env_vars) ? config.env_vars : []) {
      const name = typeof entry === "string" ? entry : record(entry).name;
      if (typeof name === "string") env[name] ??= `\${${name}}`;
    }
    shaped = {
      ...(config.command !== undefined ? { command: config.command } : {}),
      ...(Array.isArray(config.args) ? { args: config.args } : {}),
    };
  }
  if (Object.keys(env).length > 0) shaped.env = env;

  const read = readMcpServer(key, shaped, { ...options, where });
  if (config.enabled === false)
    warnings.push({
      code: "field_dropped",
      message: `${where} is turned off in Codex (enabled = false); the item is exported as a server that's on.`,
    });
  for (const dropped of Object.keys(config).filter((k) => !KEPT.includes(k)))
    warnings.push({
      code: "field_dropped",
      message: `${where}'s \`${dropped}\` was left out: an MCP server in Ronne has no such setting.`,
    });
  return { ...read, warnings: [...warnings, ...read.warnings] };
};
