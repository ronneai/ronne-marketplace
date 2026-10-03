import { parseItemName } from "../names.js";
import { envRef, record } from "../render/helpers.js";
import type { Change } from "../render/types.js";
import {
  jsonFile,
  moved,
  type Placement,
  type PluginAdapter,
  replacePrefix,
  withCommands,
} from "./adapter.js";

/**
 * Codex plugins (076, checked 2026-10-03): Agent Plugins 1.0 with Codex's extensions. They carry
 * skills, MCP servers, hooks and apps, so agents, `AGENTS.md` rules and permission rules stay out.
 */
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

const FOLDERS: [string, string][] = [
  [".agents/skills/", "skills/"],
  [".codex/hooks/", "hooks/"],
];

/** Where the renderer runs a hook's script from at project scope, and where a plugin does. */
const SCRIPT_FROM = '"$(git rev-parse --show-toplevel)"/.codex/hooks/';
const SCRIPT_TO = `"${envRef("PLUGIN_ROOT", "json-template")}"/hooks/`;

const ref = (name: unknown) => envRef(String(name), "json-template");

/**
 * A `[mcp_servers.<n>]` table as the Agent Plugins `mcp.json` says it: a `type`, and the variables
 * Codex names (`env_vars`, `bearer_token_env_var`, `env_http_headers`) as `${NAME}` references.
 */
export const portableServer = (value: unknown): Record<string, unknown> => {
  const table = record(value);
  if (typeof table.url === "string") {
    const headers: Record<string, string> = {};
    for (const [header, text] of Object.entries(record(table.http_headers)))
      headers[header] = String(text);
    for (const [header, name] of Object.entries(record(table.env_http_headers)))
      headers[header] = ref(name);
    if (typeof table.bearer_token_env_var === "string")
      headers.Authorization = `Bearer ${ref(table.bearer_token_env_var)}`;
    return {
      type: "streamable-http",
      url: table.url,
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  }
  const names = Array.isArray(table.env_vars) ? table.env_vars.map(String) : [];
  return {
    type: "stdio",
    command: table.command,
    ...(Array.isArray(table.args) ? { args: table.args } : {}),
    ...(names.length ? { env: Object.fromEntries(names.map((name) => [name, ref(name)])) } : {}),
  };
};

const place = (change: Change): Placement => {
  const files = moved(change, FOLDERS);
  if (files) return files;
  switch (change.kind) {
    case "file":
      if (change.path.startsWith(".codex/agents/"))
        return { leftOut: "Codex plugins carry no agents" };
      if (change.path.startsWith(".codex/rules/"))
        return { leftOut: "Codex plugins can't set permission rules" };
      break;
    case "section":
      return { leftOut: "Codex plugins can't add to AGENTS.md" };
    case "json-array-item":
      if (change.path === ".codex/hooks.json" && change.key[0] === "hooks" && change.key[1])
        return [
          {
            kind: "hook",
            event: change.key[1],
            entry: withCommands(change.item, (c) => replacePrefix(c, SCRIPT_FROM, SCRIPT_TO)),
          },
        ];
      break;
    case "toml-key":
      if (change.path === ".codex/config.toml" && change.key[0] === "mcp_servers" && change.key[1])
        return [{ kind: "mcp", name: change.key[1], server: portableServer(change.value) }];
      break;
  }
  return { leftOut: `Codex plugins have no place for ${change.path}` };
};

export const codexAdapter: PluginAdapter = {
  tool: "codex",
  toolName: "Codex",
  place,
  manifest: (item, name) =>
    jsonFile("plugin.json", {
      $schema: PLUGIN_SCHEMA,
      name,
      version: item.version,
      description: String(item.manifest.description ?? ""),
      author: { name: parseItemName(item.name)?.scope ?? "" },
    }),
  hooksFile: (hooks) => jsonFile("hooks/hooks.json", { hooks }),
  mcpFile: (servers) => jsonFile("mcp.json", { $schema: MCP_SCHEMA, mcpServers: servers }),
};
