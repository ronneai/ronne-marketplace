import { parseItemName } from "../names.js";
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
 * Cursor plugins (076, checked 2026-10-03): `rules/`, `skills/`, `agents/`, `hooks/hooks.json` and
 * `mcp.json`, with `.cursor-plugin/plugin.json`. Permission rules stay out: they're the `agent`
 * CLI's settings, not part of a plugin.
 */
const FOLDERS: [string, string][] = [
  [".agents/skills/", "skills/"],
  [".cursor/agents/", "agents/"],
  [".cursor/rules/", "rules/"],
  [".cursor/hooks/", "hooks/"],
];

const HOOKS = ".cursor/hooks.json";

const place = (change: Change): Placement => {
  const files = moved(change, FOLDERS);
  if (files) return files;
  switch (change.kind) {
    case "json-array-item":
      if (change.path === HOOKS && change.key[0] === "hooks" && change.key[1])
        return [
          {
            kind: "hook",
            event: change.key[1],
            // A plugin's hook commands are relative to the plugin, as in Cursor's examples.
            entry: withCommands(change.item, (c) => replacePrefix(c, ".cursor/hooks/", "./hooks/")),
          },
        ];
      if (change.key[0] === "permissions")
        return { leftOut: "Cursor plugins can't set the CLI's permissions" };
      break;
    case "json-key":
      // `hooks.json`'s `version`: a plugin's hooks file doesn't take it.
      if (change.path === HOOKS && change.key[0] === "version") return [];
      if (change.path === ".cursor/mcp.json" && change.key[0] === "mcpServers" && change.key[1])
        return [{ kind: "mcp", name: change.key[1], server: change.value }];
      break;
  }
  return { leftOut: `Cursor plugins have no place for ${change.path}` };
};

export const cursorAdapter: PluginAdapter = {
  tool: "cursor",
  toolName: "Cursor",
  place,
  manifest: (item, name) =>
    jsonFile(".cursor-plugin/plugin.json", {
      name,
      version: item.version,
      description: String(item.manifest.description ?? ""),
      author: { name: parseItemName(item.name)?.scope ?? "" },
    }),
  hooksFile: (hooks) => jsonFile("hooks/hooks.json", { hooks }),
  mcpFile: (servers) => jsonFile("mcp.json", { mcpServers: servers }),
};
