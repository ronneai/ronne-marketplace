import type { ItemType } from "@ronneai/core";

export type PublishedItem = { id: string; scope: string; name: string; type: ItemType };

export type PublishedVersion = {
  version: string;
  yanked: boolean;
  /** The version's own dependencies, from its manifest: `@scope/name` → range. */
  dependencies: Readonly<Record<string, string>>;
};

/**
 * What the registry checks (spec 013) need to know about published items. Releases (015) create
 * items and versions; 015 replaces `unreleasedRegistry` with a lookup on those tables, and the
 * checks don't change.
 */
export interface RegistryLookup {
  findItem(scope: string, name: string): Promise<PublishedItem | null>;
  publishedVersions(itemId: string): Promise<PublishedVersion[]>;
}

/** M2: nothing is released yet, so no item is published. */
export const unreleasedRegistry: RegistryLookup = {
  findItem: async () => null,
  publishedVersions: async () => [],
};
