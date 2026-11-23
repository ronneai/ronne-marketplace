import type { PackageFile } from "../package-file.js";
import { jsonFile } from "./adapter.js";
import type { PluginTool } from "./types.js";

/**
 * Plugin marketplaces (076, contract `docs/spec/plugin-feeds.md`): each tool's catalogue of the
 * feed's plugins, pointing at zips the instance serves (Claude Code only) or at folders next to it
 * in the git mirror (078).
 */

/** Where a marketplace entry finds its plugin. */
export type PluginSource =
  | { kind: "archive"; url: string; sha256: string }
  /** Relative to the marketplace's root, such as `plugins/codex/team.secure-coding`. */
  | { kind: "path"; path: string };

export type MarketplaceEntry = {
  /** `scope.name`. */
  name: string;
  version: string;
  description: string;
  source: PluginSource;
};

export type MarketplaceOptions = {
  /** From `marketplaceName`. */
  name: string;
  /** Who runs the feed, such as "Ronne at registry.example.com". */
  owner: string;
  description: string;
};

/** Each tool's marketplace file, relative to the marketplace's root. */
export const MARKETPLACE_PATHS: Partial<Record<PluginTool, string>> = {
  "claude-code": ".claude-plugin/marketplace.json",
  codex: ".agents/plugins/marketplace.json",
  cursor: ".cursor-plugin/marketplace.json",
  // Copilot looks here first, so it doesn't pick up Claude Code's `.claude-plugin/` in the mirror.
  copilot: ".github/plugin/marketplace.json",
  // Antigravity and Gemini CLI take no marketplace a third party serves: their plugins are only
  // folders in the git mirror (029).
};

/**
 * The feed's marketplace name, `ronne-<host>`: the instance's host with `.` and `:` as `-`, so it
 * fits every tool's pattern (Cursor's is the strictest: lowercase letters, digits and hyphens).
 */
export const marketplaceName = (publicUrl: string): string => {
  const host = new URL(publicUrl).host.toLowerCase();
  return `ronne-${host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
};

const claudeSource = (source: PluginSource) =>
  source.kind === "archive"
    ? { source: "archive", url: source.url, sha256: source.sha256 }
    : `./${source.path}`;

const pathOf = (tool: PluginTool, source: PluginSource) => {
  if (source.kind !== "path")
    throw new Error(`A ${tool} marketplace can only point at folders, not at an archive.`);
  return source.path;
};

/**
 * The tool's marketplace file, its entries sorted by name; null for a tool that has none
 * (Antigravity, Gemini CLI: 029).
 */
export const marketplaceFor = (
  tool: PluginTool,
  entries: readonly MarketplaceEntry[],
  options: MarketplaceOptions,
): PackageFile | null => {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const path = MARKETPLACE_PATHS[tool];
  if (!path) return null;
  switch (tool) {
    case "claude-code":
      // The version goes here, not in the plugin's own manifest (contract). Claude Code reads the
      // top-level description first (checked 2026-10-03, 077).
      return jsonFile(path, {
        name: options.name,
        owner: { name: options.owner },
        description: options.description,
        plugins: sorted.map((entry) => ({
          name: entry.name,
          version: entry.version,
          description: entry.description,
          source: claudeSource(entry.source),
        })),
      });
    case "codex":
      return jsonFile(path, {
        name: options.name,
        interface: { displayName: options.owner },
        plugins: sorted.map((entry) => ({
          name: entry.name,
          source: { source: "local", path: `./${pathOf(tool, entry.source)}` },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        })),
      });
    case "cursor":
      return jsonFile(path, {
        name: options.name,
        owner: { name: options.owner },
        metadata: { description: options.description },
        plugins: sorted.map((entry) => ({
          name: entry.name,
          version: entry.version,
          description: entry.description,
          source: pathOf(tool, entry.source),
        })),
      });
    case "copilot":
      // The CLI plugin reference's fields (2026-11-22); a folder `source` relative to the root.
      return jsonFile(path, {
        name: options.name,
        owner: { name: options.owner },
        metadata: { description: options.description },
        plugins: sorted.map((entry) => ({
          name: entry.name,
          version: entry.version,
          description: entry.description,
          source: `./${pathOf(tool, entry.source)}`,
        })),
      });
    default:
      return null;
  }
};
