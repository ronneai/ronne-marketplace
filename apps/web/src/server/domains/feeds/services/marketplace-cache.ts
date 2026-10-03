import type { PluginTool } from "@ronneai/core/plugins";

/**
 * The marketplace cache (feature 079): each tool's last complete marketplace file, in this
 * process's memory, under the key it was built for (catalogue revision, builder version and
 * PUBLIC_URL). One entry per tool: a newer key replaces the older one. It also runs the background
 * builds that finish a feed a request ran out of time for, at most one per tool at a time.
 */
export type MarketplaceCache = {
  get(tool: PluginTool, key: string): Uint8Array | null;
  set(tool: PluginTool, key: string, bytes: Uint8Array): void;
  /**
   * Runs `work` unless a build for the tool is already running, and resolves when the running one
   * is done. Errors are the caller's to catch inside `work`.
   */
  warm(tool: PluginTool, work: () => Promise<void>): Promise<void>;
  /** The tool's running background build, or null: for tests and the benchmark to wait on. */
  warming(tool: PluginTool): Promise<void> | null;
};

export const createMarketplaceCache = (): MarketplaceCache => {
  const files = new Map<PluginTool, { key: string; bytes: Uint8Array }>();
  const running = new Map<PluginTool, Promise<void>>();
  return {
    get: (tool, key) => {
      const entry = files.get(tool);
      return entry && entry.key === key ? entry.bytes : null;
    },
    set: (tool, key, bytes) => {
      files.set(tool, { key, bytes });
    },
    warm: (tool, work) => {
      const current = running.get(tool);
      if (current) return current;
      const next = work().finally(() => running.delete(tool));
      running.set(tool, next);
      return next;
    },
    warming: (tool) => running.get(tool) ?? null,
  };
};
