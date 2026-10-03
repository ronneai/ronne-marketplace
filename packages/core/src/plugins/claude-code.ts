import { parseItemName } from "../names.js";
import { envRef } from "../render/helpers.js";
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
 * Claude Code plugins (076, checked 2026-10-03): `skills/`, `agents/`, `output-styles/`,
 * `hooks/hooks.json`, `.mcp.json` and `.lsp.json`. A plugin's settings only take `agent` and
 * `subagentStatusLine`, and its `CLAUDE.md` isn't loaded, so rules that are always on or follow
 * file patterns, permissions and status lines stay out.
 */
const SETTINGS = ".claude/settings.json";

const FOLDERS: [string, string][] = [
  [".claude/skills/", "skills/"],
  [".claude/agents/", "agents/"],
  [".claude/output-styles/", "output-styles/"],
  [".claude/hooks/", "hooks/"],
];

/** Where the renderer runs a hook's script from at project scope, and where a plugin does. */
const SCRIPT_FROM = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/';
const SCRIPT_TO = `"${envRef("CLAUDE_PLUGIN_ROOT", "json-template")}"/hooks/`;

const RULES = "Claude Code plugins have no rules that are always on or follow file patterns";
const STATUS = "Claude Code plugins can't set the status line";

const decoder = new TextDecoder();

/** The local plugin rmk writes for an `lsp-server` (023): only its `.lsp.json` is wanted. */
const lspOf = (change: Change & { kind: "dir" }): Placement => {
  const file = change.files.find((f) => f.path === ".lsp.json");
  if (!file) return [];
  const text = typeof file.content === "string" ? file.content : decoder.decode(file.content);
  return [{ kind: "lsp", servers: JSON.parse(text) as Record<string, unknown> }];
};

const place = (change: Change): Placement => {
  const files = moved(change, FOLDERS);
  if (files) return files;
  switch (change.kind) {
    case "dir":
      if (change.path.startsWith(".claude/rmk-plugins/")) return lspOf(change);
      break;
    case "file":
      if (change.path.startsWith(".claude/rules/")) return { leftOut: RULES };
      if (change.path.startsWith(".claude/statusline/")) return { leftOut: STATUS };
      break;
    case "json-array-item":
      if (change.path === SETTINGS && change.key[0] === "hooks" && change.key[1])
        return [
          {
            kind: "hook",
            event: change.key[1],
            entry: withCommands(change.item, (c) => replacePrefix(c, SCRIPT_FROM, SCRIPT_TO)),
          },
        ];
      if (change.path === SETTINGS && change.key[0] === "permissions")
        return { leftOut: "Claude Code plugins can't set permissions" };
      break;
    case "json-key":
      if (change.path === ".mcp.json" && change.key[0] === "mcpServers" && change.key[1])
        return [{ kind: "mcp", name: change.key[1], server: change.value }];
      // What registers rmk's local lsp plugin; the plugin is the feed's own.
      if (
        change.path === SETTINGS &&
        (change.key[0] === "extraKnownMarketplaces" || change.key[0] === "enabledPlugins")
      )
        return [];
      if (change.path === SETTINGS && change.key[0] === "statusLine") return { leftOut: STATUS };
      break;
  }
  return { leftOut: `Claude Code plugins have no place for ${change.path}` };
};

export const claudeCodeAdapter: PluginAdapter = {
  tool: "claude-code",
  toolName: "Claude Code",
  place,
  // No `version`: Claude Code reads it from the marketplace entry (contract).
  manifest: (item, name) =>
    jsonFile(".claude-plugin/plugin.json", {
      name,
      description: String(item.manifest.description ?? ""),
      author: { name: parseItemName(item.name)?.scope ?? "" },
    }),
  hooksFile: (hooks) => jsonFile("hooks/hooks.json", { hooks }),
  mcpFile: (servers) => jsonFile(".mcp.json", { mcpServers: servers }),
};
