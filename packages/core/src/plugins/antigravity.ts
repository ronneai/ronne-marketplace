import { parseItemName } from "../names.js";
import { record } from "../render/helpers.js";
import type { Change } from "../render/types.js";
import { jsonFile, moved, type Part, type Placement, type PluginAdapter } from "./adapter.js";

/**
 * Antigravity plugins (029, checked 2026-11-22 against antigravity.google/docs build-plugins):
 * `plugin.json` at the root (its schema refuses other top-level keys, and its `name` is
 * `^[a-z0-9]+(-[a-z0-9]+)*$`), with `skills/`, `agents/`, `rules/`, `hooks.json` keyed by hook name,
 * and `mcp_config.json`. A plugin's hooks run from the plugin's root, so a script runs as
 * `./hooks/<n>/…`. Permission policies and the status line stay out: they're the CLI's settings.
 */
const SCHEMA = "https://antigravity.google/schemas/v1/plugin.json";

const FOLDERS: [string, string][] = [
  [".agents/skills/", "skills/"],
  [".agents/agents/", "agents/"],
  [".agents/rules/", "rules/"],
  [".agents/hooks/", "hooks/"],
];

/** The renderer's line that moves a project hook to the project root, which a plugin has no use for. */
const AT_ROOT = "cd .. || exit 1\n";

/** A hook command run from the plugin's root instead of the project's `.agents/`. */
const fromPlugin = (command: string): string => {
  const own = command.startsWith(AT_ROOT) ? command.slice(AT_ROOT.length) : command;
  if (own.startsWith("./.agents/hooks/")) return `./hooks/${own.slice("./.agents/hooks/".length)}`;
  if (own.startsWith("./'.agents/hooks/"))
    return `./'hooks/${own.slice("./'.agents/hooks/".length)}`;
  return own;
};

/** A named hook's value with each handler's command run from the plugin. */
const pluginHook = (value: unknown): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record(value)).map(([event, entries]) => [
      event,
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const item = record(entry);
        if (typeof item.command === "string") return { ...item, command: fromPlugin(item.command) };
        if (Array.isArray(item.hooks))
          return {
            ...item,
            hooks: item.hooks.map((hook) => {
              const handler = record(hook);
              return typeof handler.command === "string"
                ? { ...handler, command: fromPlugin(handler.command) }
                : handler;
            }),
          };
        return item;
      }),
    ]),
  );

/** `scope.name` as Antigravity takes a plugin's name: `scope-name`. */
export const antigravityPluginName = (name: string) => name.replaceAll(".", "-");

const place = (change: Change): Placement => {
  const files = moved(change, FOLDERS);
  if (files) return files;
  if (change.kind === "json-key") {
    // A hook is a named key; the builder gathers parts by their "event", here the hook's name.
    if (change.path === ".agents/hooks.json" && change.key.length === 1 && change.key[0])
      return [{ kind: "hook", event: change.key[0], entry: pluginHook(change.value) } as Part];
    if (
      change.path === ".agents/mcp_config.json" &&
      change.key[0] === "mcpServers" &&
      change.key[1]
    )
      return [{ kind: "mcp", name: change.key[1], server: change.value }];
  }
  return { leftOut: `Antigravity plugins have no place for ${change.path}` };
};

export const antigravityAdapter: PluginAdapter = {
  tool: "antigravity",
  toolName: "Antigravity",
  place,
  manifest: (item, name) =>
    jsonFile("plugin.json", {
      $schema: SCHEMA,
      name: antigravityPluginName(name),
      version: item.version,
      description: String(item.manifest.description ?? ""),
      author: { name: parseItemName(item.name)?.scope ?? "" },
    }),
  // Hooks keyed by name, each the renderer's value; two members never share a name.
  hooksFile: (hooks) =>
    jsonFile(
      "hooks.json",
      Object.fromEntries(Object.entries(hooks).map(([name, values]) => [name, values[0]])),
    ),
  mcpFile: (servers) => jsonFile("mcp_config.json", { mcpServers: servers }),
};
