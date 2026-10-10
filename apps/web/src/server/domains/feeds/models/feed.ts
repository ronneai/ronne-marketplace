import { formatItemName, GLOBAL_WORKSPACE } from "@ronneai/core";
import {
  marketplaceName,
  PLUGIN_BUILDER_VERSION,
  type PluginTool,
  pluginName,
  pluginNameProblem,
} from "@ronneai/core/plugins";
import { installsIn, supportOf } from "@ronneai/core/render";

/**
 * Native plugin feeds (feature 077, contract `docs/spec/plugin-feeds.md`): the released items as a
 * tool's plugin marketplace, each plugin built once per version and builder version and kept in
 * the StorageAdapter.
 */

/**
 * The tools whose feed the instance serves. Claude Code reads its marketplace over HTTPS (077);
 * Codex's and Cursor's are read only by `rmk feed build`, which writes their git mirror (078).
 */
export type ServedTool = PluginTool;

export const SERVED_TOOLS: readonly ServedTool[] = ["claude-code", "codex", "cursor"];

export const isServedTool = (value: string): value is ServedTool =>
  (SERVED_TOOLS as readonly string[]).includes(value);

/** A plugin by its item's name and version; `workspace` left out or `global` for global's (118). */
export type PluginRef = { workspace?: string; scope: string; name: string; version: string };

/** The workspace segments of a plugin's key and URL: none in `global` (118). */
const inWorkspace = (ref: PluginRef, before: string) =>
  ref.workspace && ref.workspace !== GLOBAL_WORKSPACE
    ? `${before}${encodeURIComponent(ref.workspace)}/`
    : "";

/** One plugin in a marketplace. */
export type FeedPlugin = PluginRef & {
  description: string;
  sha256: string;
};

/**
 * Where a built plugin's zip is kept. Artifacts are `scope/name/version.tgz`, three segments, so
 * these five-segment keys never meet them; a workspace's (118) add `@workspace/` before the scope,
 * so they never meet `global`'s. The builder version is in the key: a new builder builds every
 * plugin again, and the old zips stay as artifacts do.
 */
export const pluginKey = (tool: PluginTool, ref: PluginRef) =>
  `feeds/${tool}/${inWorkspace(ref, "@")}${ref.scope}/${ref.name}/${ref.version}-b${PLUGIN_BUILDER_VERSION}.zip`;

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

/**
 * The zip route's URL for a plugin, each segment encoded (a version may contain `+`); a workspace's
 * (118) are under `/feeds/{tool}/workspaces/{workspace}/plugins/…`.
 */
export const pluginUrl = (publicUrl: string, tool: ServedTool, ref: PluginRef) =>
  `${baseUrl(publicUrl)}/api/v1/feeds/${tool}/${inWorkspace(ref, "workspaces/")}plugins/${encodeURIComponent(ref.scope)}/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.version)}.zip`;

/** The marketplace route's URL, which `rmk plugin-setup` writes into Claude Code's settings. */
export const marketplaceUrl = (publicUrl: string, tool: ServedTool) =>
  `${baseUrl(publicUrl)}/api/v1/feeds/${tool}/marketplace.json`;

/** How long a plugin says the name it had before (118): a moved item is a new plugin. */
export const MOVED_NOTE_DAYS = 30;

/**
 * A plugin's description: a deprecated version says so first (contract, Which items appear), and
 * an item renamed in the last 30 days says what it was called (118).
 */
export const pluginDescription = (
  description: string,
  deprecatedMessage: string | null,
  movedFrom: string | null = null,
) =>
  [
    deprecatedMessage ? `Deprecated: ${deprecatedMessage}` : "",
    movedFrom ? `Moved from ${movedFrom}.` : "",
    description,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

/**
 * The largest marketplace file Claude Code reads (5 MiB, checked 2026-10-03). Past it, the route
 * answers 507 rather than a file the tool would refuse.
 */
export const MARKETPLACE_MAX_BYTES = 5 * 1024 * 1024;

/** Types with no place in a Claude Code plugin (contract, Plugin contents per type). */
const NO_CLAUDE_CODE_PLUGIN = new Set(["permission-policy", "statusline"]);

/**
 * Whether a version is in the Claude Code feed by its type and manifest, without building it: it
 * installs in Claude Code, its type has a plugin form, a rule only when the model or the person
 * turns it on (an `always` or `glob` rule has no place in a plugin), and Claude Code takes the
 * name. The item page uses it for the Install panel's plugin command.
 */
export const inClaudeCodeFeed = (
  item: { workspace?: string; scope: string; name: string; type: string },
  manifest: Record<string, unknown>,
): boolean => {
  if (!installsIn(supportOf(manifest, item.type)["claude-code"])) return false;
  if (NO_CLAUDE_CODE_PLUGIN.has(item.type)) return false;
  if (pluginNameProblem("claude-code", pluginName(formatItemName(item)))) return false;
  if (item.type !== "rule") return true;
  const activation = (manifest.rule as { activation?: unknown } | undefined)?.activation;
  return activation === "model" || activation === "manual";
};

/** What a person types in Claude Code to install the item as a plugin from this instance. */
export const pluginInstallCommand = (
  item: { workspace?: string; scope: string; name: string },
  publicUrl: string,
) => `/plugin install ${pluginName(formatItemName(item))}@${marketplaceName(baseUrl(publicUrl))}`;

/** Past 80% of Claude Code's 5 MiB, root is warned (079). */
export const SIZE_WARNING_BYTES = Math.floor(MARKETPLACE_MAX_BYTES * 0.8);

/** Half of the 10 seconds Claude Code waits for a marketplace (079); any tool, as CI waits too. */
export const TIME_WARNING_MS = 5_000;

/** What a tool's marketplace measured when it was last built (079). */
export type FeedStats = {
  tool: PluginTool;
  sizeBytes: number;
  plugins: number;
  buildMs: number;
  revision: number;
  builtAt: Date;
};

export type FeedWarning = "size" | "time";

/** The limits a feed is checked against: Claude Code's, unless a test sets smaller ones. */
export type FeedLimits = { maxBytes: number; sizeWarningBytes: number; timeWarningMs: number };

export const FEED_LIMITS: FeedLimits = {
  maxBytes: MARKETPLACE_MAX_BYTES,
  sizeWarningBytes: SIZE_WARNING_BYTES,
  timeWarningMs: TIME_WARNING_MS,
};

/** Which limits a build came near: size only matters for Claude Code, which reads it from a URL. */
export const feedWarnings = (
  stats: Pick<FeedStats, "tool" | "sizeBytes" | "buildMs">,
  limits: FeedLimits = FEED_LIMITS,
) => {
  const warnings: FeedWarning[] = [];
  if (stats.tool === "claude-code" && stats.sizeBytes >= limits.sizeWarningBytes)
    warnings.push("size");
  if (stats.buildMs >= limits.timeWarningMs) warnings.push("time");
  return warnings;
};

const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

/** The log line for a build's warnings. */
export const feedWarningMessage = (
  stats: Pick<FeedStats, "tool" | "sizeBytes" | "buildMs" | "plugins">,
  warnings: readonly FeedWarning[],
  limits: FeedLimits = FEED_LIMITS,
) => {
  const parts: string[] = [];
  if (warnings.includes("size"))
    parts.push(
      `its marketplace is ${mib(stats.sizeBytes)} (${stats.plugins} plugins), ${Math.round((stats.sizeBytes / limits.maxBytes) * 100)}% of the ${mib(limits.maxBytes)} Claude Code reads from an address; the git mirror (rmk feed build) has no such limit`,
    );
  if (warnings.includes("time"))
    parts.push(
      `building its marketplace took ${(stats.buildMs / 1000).toFixed(1)} s, and Claude Code waits 10 s`,
    );
  return `${stats.tool} feed: ${parts.join("; ")}.`;
};
