import { readMcpServer } from "../claude-code/mcp-server.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/** Cursor's variables that aren't environment variables: nothing equivalent in an item. */
const CURSOR_VARIABLES = [
  "userHome",
  "workspaceFolder",
  "workspaceFolderBasename",
  "pathSeparator",
  "/",
];

/**
 * A string with `${env:NAME}` as `${NAME}`, and each name found; Cursor's other variables stay as
 * written. A loop, not a regex (docs/knowledge/codeql-regex.md).
 */
const envRefs = (text: string): { text: string; names: string[]; other: string[] } => {
  let out = "";
  let from = 0;
  const names: string[] = [];
  const other: string[] = [];
  for (;;) {
    const start = text.indexOf("${", from);
    if (start === -1) break;
    const close = text.indexOf("}", start + 2);
    if (close === -1) break;
    const inner = text.slice(start + 2, close);
    if (inner.startsWith("env:")) {
      const name = inner.slice(4);
      names.push(name);
      out += `${text.slice(from, start)}\${${name}}`;
    } else {
      if (CURSOR_VARIABLES.includes(inner)) other.push(inner);
      else names.push(inner);
      out += text.slice(from, close + 1);
    }
    from = close + 1;
  }
  return { text: out + text.slice(from), names, other };
};

/**
 * A Cursor MCP server (`mcpServers.<n>` in `.cursor/mcp.json`) as an item (native-readers.md §10),
 * through the Claude Code reader's rules once `${env:NAME}` is `${NAME}`: no value is kept, and
 * each variable a value references is declared.
 */
export const readCursorMcpServer = (
  key: string,
  value: unknown,
  options: { itemName: string; description?: string },
): ReadResult => {
  const where = `.cursor/mcp.json mcpServers.${key}`;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't an object.`);
  const config = value as Record<string, unknown>;
  const warnings: ReadWarning[] = [];
  const referenced = new Set<string>();
  const others = new Set<string>();
  const convert = (text: unknown): string => {
    const converted = envRefs(String(text));
    for (const name of converted.names) referenced.add(name);
    for (const name of converted.other) others.add(name);
    return converted.text;
  };

  const shaped: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(config)) {
    if (field === "command" || field === "url") shaped[field] = convert(raw);
    else if (field === "args" && Array.isArray(raw)) shaped.args = raw.map(convert);
    else if ((field === "headers" || field === "env") && raw && typeof raw === "object")
      shaped[field] = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, convert(v)]),
      );
    else if (field !== "type") shaped[field] = raw;
  }
  // A remote server is streamable HTTP or SSE, which Cursor tells apart itself: http for an item.
  shaped.type = typeof config.url === "string" ? "http" : "stdio";
  const env = { ...((shaped.env as Record<string, string> | undefined) ?? {}) };
  for (const name of referenced) env[name] ??= `\${${name}}`;
  if (Object.keys(env).length > 0) shaped.env = env;

  for (const name of others)
    warnings.push({
      code: "field_dropped",
      message: `${where} uses Cursor's \${${name}}, which other tools don't have; it's kept as written.`,
    });
  const read = readMcpServer(key, shaped, { ...options, where });
  return { ...read, warnings: [...warnings, ...read.warnings] };
};
