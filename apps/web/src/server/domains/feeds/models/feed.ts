import { PLUGIN_BUILDER_VERSION, type PluginTool } from "@ronneai/core/plugins";

/**
 * Native plugin feeds (feature 077, contract `docs/spec/plugin-feeds.md`): the released items as a
 * tool's plugin marketplace, each plugin built once per version and builder version and kept in
 * the StorageAdapter.
 */

/** The tools whose feed the instance serves itself: Claude Code reads a marketplace over HTTPS. */
export type ServedTool = Extract<PluginTool, "claude-code">;

export const SERVED_TOOLS: readonly ServedTool[] = ["claude-code"];

export const isServedTool = (value: string): value is ServedTool =>
  (SERVED_TOOLS as readonly string[]).includes(value);

export type PluginRef = { scope: string; name: string; version: string };

/** One plugin in a marketplace. */
export type FeedPlugin = PluginRef & {
  description: string;
  sha256: string;
};

/**
 * Where a built plugin's zip is kept. Artifacts are `scope/name/version.tgz`, three segments, so
 * these five-segment keys never meet them. The builder version is in the key: a new builder builds
 * every plugin again, and the old zips stay as artifacts do.
 */
export const pluginKey = (tool: PluginTool, ref: PluginRef) =>
  `feeds/${tool}/${ref.scope}/${ref.name}/${ref.version}-b${PLUGIN_BUILDER_VERSION}.zip`;

/** The sidecar next to the zip: its sha256, or `none` when the version has nothing for the tool. */
export const sidecarKey = (tool: PluginTool, ref: PluginRef) => `${pluginKey(tool, ref)}.sha256`;

export const NO_PLUGIN = "none";

/** What a sidecar says: the zip's sha256, `none`, or null when it isn't a sidecar Ronne wrote. */
export const readSidecar = (bytes: Uint8Array): string | typeof NO_PLUGIN | null => {
  const text = new TextDecoder().decode(bytes);
  return text === NO_PLUGIN || /^[0-9a-f]{64}$/.test(text) ? text : null;
};

export const sidecarBytes = (value: string | typeof NO_PLUGIN) => new TextEncoder().encode(value);

/** The instance's address without a trailing slash, as feed URLs start with it. */
export const baseUrl = (publicUrl: string) => {
  let end = publicUrl.length;
  while (end > 0 && publicUrl[end - 1] === "/") end--;
  return publicUrl.slice(0, end);
};

/** The zip route's URL for a plugin, each segment encoded (a version may contain `+`). */
export const pluginUrl = (publicUrl: string, tool: ServedTool, ref: PluginRef) =>
  `${baseUrl(publicUrl)}/api/v1/feeds/${tool}/plugins/${encodeURIComponent(ref.scope)}/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.version)}.zip`;

/** The marketplace route's URL, which `rmk plugin-setup` writes into Claude Code's settings. */
export const marketplaceUrl = (publicUrl: string, tool: ServedTool) =>
  `${baseUrl(publicUrl)}/api/v1/feeds/${tool}/marketplace.json`;

/** A plugin's description: a deprecated version says so first (contract, Which items appear). */
export const pluginDescription = (description: string, deprecatedMessage: string | null) =>
  deprecatedMessage ? `Deprecated: ${deprecatedMessage} ${description}`.trim() : description;

/**
 * The largest marketplace file Claude Code reads (5 MiB, checked 2026-10-03). Past it, the route
 * answers 507 rather than a file the tool would refuse.
 */
export const MARKETPLACE_MAX_BYTES = 5 * 1024 * 1024;
