import type { PackageFile } from "../package-file.js";
import type { RenderInput, RenderWarningCode } from "../render/types.js";

/**
 * Native plugins (feature 076, contract `docs/spec/plugin-feeds.md`): a released item, with its
 * dependencies or a bundle's members, as a Claude Code, Codex or Cursor plugin. Pure, like the
 * renderers it's built on: no file system, network or clock.
 */

/** The tools a plugin is built for, by renderer id. */
export type PluginTool = "claude-code" | "codex" | "cursor";

export const PLUGIN_TOOLS: readonly PluginTool[] = ["claude-code", "codex", "cursor"];

export const isPluginTool = (value: string): value is PluginTool =>
  (PLUGIN_TOOLS as readonly string[]).includes(value);

/**
 * Goes up whenever the plugin built from the same input changes, so a cached zip (077) is built
 * again: it's part of the cache key.
 */
export const PLUGIN_BUILDER_VERSION = 1;

export type PluginInput = {
  /** The item the plugin is named after; its version is the plugin's. */
  item: RenderInput;
  /**
   * Everything that goes in, in install order: a bundle's resolved members, or the item and its
   * resolved dependencies. The caller resolves (020); the builder doesn't.
   */
  members: readonly RenderInput[];
  /**
   * Old names of the members (118), old name → name now: an old version's `ronne.yaml` may name
   * its dependencies by them.
   */
  oldNames?: ReadonlyMap<string, string>;
};

export type PluginWarningCode =
  | RenderWarningCode
  /** What a member's renderer wrote has no place in a plugin, so it was left out. */
  | "not_in_plugin"
  /** The tool refuses the plugin's name (contract, Names). */
  | "name_refused";

export type PluginWarning = { code: PluginWarningCode; message: string };

export type BuiltPlugin = {
  /** `scope.name`. */
  name: string;
  /** Sorted by path, the manifest included. */
  files: PackageFile[];
  warnings: PluginWarning[];
  /**
   * The item itself (a bundle: any member) put nothing in, so the plugin would only carry its
   * dependencies, or nothing: the item stays out of the tool's feed.
   */
  empty: boolean;
};
