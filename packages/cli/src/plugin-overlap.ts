import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marketplaceName, pluginName } from "@ronneai/core/plugins";
import type { Io } from "./io.js";

/**
 * Items that are also enabled as Claude Code plugins from the same registry (077). `rmk install`
 * and the plugin marketplace don't share state, so an item installed both ways is loaded twice:
 * rmk warns, and carries on. Claude Code merges `enabledPlugins` from the user's settings and the
 * project's, so all three files are read; one that's missing or isn't JSON counts as empty.
 */
const SETTINGS = [
  (io: Io) => join(io.home, ".claude", "settings.json"),
  (io: Io) => join(io.cwd, ".claude", "settings.json"),
  (io: Io) => join(io.cwd, ".claude", "settings.local.json"),
];

const enabledPlugins = (io: Io): Set<string> => {
  const enabled = new Set<string>();
  for (const pathOf of SETTINGS) {
    let settings: unknown;
    try {
      settings = JSON.parse(readFileSync(pathOf(io), "utf8"));
    } catch {
      continue;
    }
    const plugins = (settings as { enabledPlugins?: unknown } | null)?.enabledPlugins;
    if (plugins && typeof plugins === "object" && !Array.isArray(plugins))
      for (const [id, on] of Object.entries(plugins)) if (on === true) enabled.add(id);
  }
  return enabled;
};

/** Each installed item that is also an enabled plugin, with its plugin id (`scope.name@ronne-host`). */
export const alsoEnabledAsPlugins = (
  io: Io,
  items: readonly string[],
  registry: string,
): { item: string; plugin: string }[] => {
  const enabled = enabledPlugins(io);
  if (enabled.size === 0) return [];
  const marketplace = marketplaceName(registry);
  return items
    .map((item) => ({ item, plugin: `${pluginName(item)}@${marketplace}` }))
    .filter(({ plugin }) => enabled.has(plugin));
};
