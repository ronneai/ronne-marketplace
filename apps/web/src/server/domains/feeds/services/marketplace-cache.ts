import type { PluginTool } from "@ronneai/core/plugins";

/**
 * The marketplace cache (feature 079): each tool's last complete marketplace file, per visibility
 * key (093: the private workspaces its callers see, empty for public-only ones), in this process's
 * memory, under the key it was built for (catalogue revision, builder version and PUBLIC_URL). One
 * entry per slot (`marketplaceSlot`): a newer key replaces the older one. At most `maxSlots`
 * slots are kept, the least recently used going first. It also runs the background builds that
 * finish a feed a request ran out of time for, at most one per slot at a time.
 */
export type MarketplaceCache = {
  get(slot: string, key: string): Uint8Array | null;
  set(slot: string, key: string, bytes: Uint8Array): void;
  /**
   * Runs `work` unless a build for the slot is already running, and resolves when the running one
   * is done. Errors are the caller's to catch inside `work`.
   */
  warm(slot: string, work: () => Promise<void>): Promise<void>;
  /** The slot's running background build, or null: for tests and the benchmark to wait on. */
  warming(slot: string): Promise<void> | null;
};

/** A tool's slot for a visibility key: the tool's name alone for public-only callers. */
export const marketplaceSlot = (tool: PluginTool, visibility: string) =>
  visibility ? `${tool}/${visibility}` : tool;

/** Slots kept by default: each holds one marketplace, up to Claude Code's 5 MiB. */
export const MARKETPLACE_CACHE_SLOTS = 32;

export const createMarketplaceCache = (
  maxSlots: number = MARKETPLACE_CACHE_SLOTS,
): MarketplaceCache => {
  // A Map keeps insertion order: a slot used again moves to the end, and the first is the oldest.
  const files = new Map<string, { key: string; bytes: Uint8Array }>();
  const running = new Map<string, Promise<void>>();
  return {
    get: (slot, key) => {
      const entry = files.get(slot);
      if (!entry || entry.key !== key) return null;
      files.delete(slot);
      files.set(slot, entry);
      return entry.bytes;
    },
    set: (slot, key, bytes) => {
      files.delete(slot);
      files.set(slot, { key, bytes });
      for (const oldest of files.keys()) {
        if (files.size <= maxSlots) break;
        files.delete(oldest);
      }
    },
    warm: (slot, work) => {
      const current = running.get(slot);
      if (current) return current;
      const next = work().finally(() => running.delete(slot));
      running.set(slot, next);
      return next;
    },
    warming: (slot) => running.get(slot) ?? null,
  };
};
