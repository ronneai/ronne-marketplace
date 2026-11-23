import { readMcpServer } from "../claude-code/mcp-server.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/** A bare `$NAME` as `${NAME}`, the manifest's syntax; Gemini CLI expands both. */
const braced = (value: unknown): unknown =>
  typeof value === "string"
    ? value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => `\${${name}}`)
    : value;

const bracedAll = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(braced)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, braced(v)]))
      : braced(value);

/**
 * A Gemini CLI MCP server (`mcpServers.<n>` in `.gemini/settings.json` or
 * `~/.gemini/settings.json`) as an item (native-readers.md §14), through the Claude Code reader's
 * rules, so no value of `env` is read into the item and a literal credential is replaced by a
 * declared variable. `httpUrl` is an http server; `url` is SSE, read as http with a warning.
 */
/** The variables a value references, `${NAME}` or `${NAME:-default}`: the item's to declare. */
const referenced = (value: unknown): string[] =>
  typeof value === "string"
    ? [...value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] ?? "")
    : [];

/**
 * A Gemini CLI MCP server (`mcpServers.<n>` in `.gemini/settings.json` or
 * `~/.gemini/settings.json`) as an item (native-readers.md §14), through the Claude Code reader's
 * rules, so no value of `env` is read into the item and a literal credential is replaced by a
 * declared variable. `httpUrl` is an http server; `url` is SSE unless `type` says `http`, read as
 * http with a warning. A variable a header, the URL or an argument references is declared, as
 * Gemini CLI expands it from its own environment.
 */
export const readGeminiMcpServer = (
  key: string,
  value: unknown,
  options: { itemName: string; description?: string; where?: string },
): ReadResult => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't an object.`);
  const { httpUrl, url, type, ...rest } = value as Record<string, unknown>;
  const warnings: ReadWarning[] = [];
  if (httpUrl === undefined && url !== undefined && type !== "http")
    warnings.push({
      code: "field_dropped",
      message: `mcpServers.${key} uses SSE (\`url\`); it's read as an http server, which takes streamable HTTP.`,
    });
  const address = httpUrl ?? url;
  const shaped: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [
      k,
      k === "env" || k === "headers" || k === "args"
        ? bracedAll(v)
        : k === "command"
          ? braced(v)
          : v,
    ]),
  );
  const env: Record<string, unknown> = {
    ...(shaped.env && typeof shaped.env === "object"
      ? (shaped.env as Record<string, unknown>)
      : {}),
  };
  const uses = [
    ...referenced(braced(address)),
    ...Object.values((shaped.headers as Record<string, unknown>) ?? {}).flatMap(referenced),
    ...(Array.isArray(shaped.args) ? shaped.args.flatMap(referenced) : []),
  ];
  for (const name of uses) if (!Object.hasOwn(env, name)) env[name] = `\${${name}}`;
  const config: Record<string, unknown> = {
    type: address !== undefined ? "http" : "stdio",
    ...(address !== undefined ? { url: braced(address) } : {}),
    ...shaped,
    ...(Object.keys(env).length ? { env } : {}),
  };
  const read = readMcpServer(key, config, {
    ...options,
    where: options.where ?? `mcpServers.${key}`,
  });
  return warnings.length ? { ...read, warnings: [...warnings, ...read.warnings] } : read;
};
