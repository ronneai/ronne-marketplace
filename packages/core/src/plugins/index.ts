// `@ronneai/core/plugins`: items as native plugins and plugin marketplaces (feature 076).

export {
  PLUGIN_ARCHIVE_MAX_BYTES,
  type PluginArchive,
  PluginArchiveError,
  pluginArchive,
  readPluginArchive,
} from "./archive.js";
export { buildPlugin, PluginError } from "./build.js";
export {
  MARKETPLACE_PATHS,
  type MarketplaceEntry,
  type MarketplaceOptions,
  marketplaceFor,
  marketplaceName,
  type PluginSource,
} from "./marketplace.js";
export {
  itemNameOfPlugin,
  PLUGIN_NAME_PROBLEM_MESSAGES,
  type PluginNameProblem,
  pluginName,
  pluginNameProblem,
} from "./names.js";
export {
  type BuiltPlugin,
  isPluginTool,
  PLUGIN_BUILDER_VERSION,
  PLUGIN_TOOLS,
  type PluginInput,
  type PluginTool,
  type PluginWarning,
  type PluginWarningCode,
} from "./types.js";
