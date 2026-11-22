import { parseItemName, shortItemName } from "../names.js";
import { record } from "../render/helpers.js";
import type { Change } from "../render/types.js";
import {
  bytesOf,
  jsonFile,
  moved,
  type Part,
  type Placement,
  type PluginAdapter,
} from "./adapter.js";

/**
 * Copilot plugins (028, checked 2026-11-22 against the CLI plugin reference): Agent Plugins 1.0, as
 * Codex's are, with Copilot's own parts under `com.github.copilot/`: skills in `skills/` and MCP
 * servers in `mcp.json`; agents, rules, hooks and language servers under `com.github.copilot/`.
 * Permission policies and the status line stay out: they're the CLI's settings, not a plugin's.
 */
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const OWN = "com.github.copilot";

const FOLDERS: [string, string][] = [
  [".github/skills/", "skills/"],
  [".github/agents/", `${OWN}/agents/`],
  [".github/instructions/", `${OWN}/rules/`],
  [".github/hooks/", `${OWN}/hooks/`],
];

/** Where the renderer runs a hook's script from at project scope, and where a plugin does. */
const SCRIPT_FROM = ".github/hooks/";
const SCRIPT_TO = `"$COPILOT_PLUGIN_ROOT"/${OWN}/hooks/`;

/**
 * A hook command run from the plugin: the renderer's `.github/hooks/<n>/…` (quoted or not) under
 * `$COPILOT_PLUGIN_ROOT`, which Copilot sets in a plugin's hooks; the repository's `cwd` goes.
 */
const fromPlugin = (entry: unknown): unknown => {
  const { cwd: _cwd, ...value } = record(entry);
  if (typeof value.bash !== "string") return value;
  const bash = value.bash;
  if (bash.startsWith(SCRIPT_FROM)) value.bash = `${SCRIPT_TO}${bash.slice(SCRIPT_FROM.length)}`;
  else if (bash.startsWith(`'${SCRIPT_FROM}`))
    value.bash = `${SCRIPT_TO}'${bash.slice(SCRIPT_FROM.length + 1)}`;
  return value;
};

/** A hook item's own file, `.github/hooks/<n>.json`, as one hook part per entry. */
const hookParts = (content: Uint8Array | string): Part[] => {
  const parsed = record(JSON.parse(new TextDecoder().decode(bytesOf(content))));
  return Object.entries(record(parsed.hooks)).flatMap(([event, entries]) =>
    (Array.isArray(entries) ? entries : []).map(
      (entry): Part => ({ kind: "hook", event, entry: fromPlugin(entry) }),
    ),
  );
};

/** A server as the Agent Plugins `mcp.json` says it: `streamable-http`, and no `tools` list. */
const portableServer = (value: unknown): Record<string, unknown> => {
  const { tools: _tools, ...server } = record(value);
  return server.type === "http" ? { ...server, type: "streamable-http" } : server;
};

const place = (change: Change): Placement => {
  // An `always` rule is a section of the repository's instructions; a plugin has no such file, so
  // it's a rule of the plugin's own, applied everywhere.
  if (change.kind === "section" && change.path === ".github/copilot-instructions.md")
    return [
      {
        kind: "file",
        path: `${OWN}/rules/${shortItemName(change.key)}.instructions.md`,
        content: `---\napplyTo: "**"\n---\n${change.text}`,
      },
    ];
  if (
    change.kind === "file" &&
    change.path.startsWith(SCRIPT_FROM) &&
    change.path.endsWith(".json") &&
    !change.path.slice(SCRIPT_FROM.length).includes("/")
  )
    return hookParts(change.content);
  const files = moved(change, FOLDERS);
  if (files) return files;
  if (change.kind === "json-key") {
    if (change.path === ".mcp.json" && change.key[0] === "mcpServers" && change.key[1])
      return [{ kind: "mcp", name: change.key[1], server: portableServer(change.value) }];
    if (change.path === ".github/lsp.json" && change.key[0] === "lspServers" && change.key[1])
      return [{ kind: "lsp", servers: { [change.key[1]]: change.value } }];
  }
  return { leftOut: `GitHub Copilot plugins have no place for ${change.path}` };
};

export const copilotAdapter: PluginAdapter = {
  tool: "copilot",
  toolName: "GitHub Copilot",
  place,
  manifest: (item, name) =>
    jsonFile("plugin.json", {
      $schema: PLUGIN_SCHEMA,
      name,
      version: item.version,
      description: String(item.manifest.description ?? ""),
      author: { name: parseItemName(item.name)?.scope ?? "" },
    }),
  hooksFile: (hooks) => jsonFile(`${OWN}/hooks/hooks.json`, { version: 1, hooks }),
  mcpFile: (servers) => jsonFile("mcp.json", { $schema: MCP_SCHEMA, mcpServers: servers }),
  lspFile: (servers) => jsonFile(`${OWN}/lsp.json`, { lspServers: servers }),
};
