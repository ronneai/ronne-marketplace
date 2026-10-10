import type { ItemType } from "@ronneai/core";
import { installsIn, RENDERERS, type ToolSupport } from "@ronneai/core/render";

/** How the catalogue sorts (feature 018): most recently published first, or by `@scope/name`. */
/**
 * Recently published, most installed (owner, 2026-10-02: by the download count, which `rmk install`
 * raises), or by name.
 */
export type CatalogueSort = "recent" | "installs" | "name";

/** One item as the catalogue and the home page list it, from its listed version. */
export type CatalogueEntry = {
  id: string;
  /** The workspace its scope belongs to (090), by name. */
  workspace: string;
  /** Whether that workspace is private (093): its items carry a lock label. */
  privateWorkspace: boolean;
  scope: string;
  name: string;
  type: ItemType;
  /** The listed version: `latest`'s, else the newest release. */
  version: string;
  description: string;
  keywords: string[];
  /** When the listed version was released. */
  publishedAt: Date;
  /** When the item's newest version was released. */
  lastPublishedAt: Date;
  /** Whether the listed version has risk flags (014). */
  risky: boolean;
  deprecatedMessage: string | null;
  /** Whether any version can still be installed; false when every version is yanked. */
  installable: boolean;
  downloadCount: number;
  /** Each AI tool's support for the listed version (026): by renderer id. */
  support: Record<string, ToolSupport>;
};

/** Where a page ends, by the sort's keys. Items that can't be installed come after the rest. */
export type CatalogueCursor =
  | { sort: "recent"; installable: boolean; lastPublishedAt: string; id: string }
  | { sort: "installs"; installable: boolean; installs: number; id: string }
  // `id` breaks ties: two workspaces may each have `@team/lint` (118).
  | { sort: "name"; installable: boolean; scope: string; name: string; id: string };

export type CatalogueFilter = {
  search?: string;
  type?: ItemType;
  /** Any of these types (031's picker); with `type`, both apply. */
  types?: readonly ItemType[];
  scope?: string;
  /** A workspace's name (090): only items in its scopes. */
  workspace?: string;
  /** A renderer id: only items whose listed version installs in that tool (026). */
  tool?: string;
  /** Only items with a version that can still be installed. */
  installable?: boolean;
  /** Only items whose listed version isn't yanked (077's plugin feeds). */
  listedNotYanked?: boolean;
  /** Only items this user first published (089: your own, whatever their rank). */
  ownerId?: string;
  /**
   * Only items an item in this workspace may depend on (093): its own and public workspaces'.
   * Null for an item whose workspace isn't known yet: public ones only.
   */
  dependableFrom?: string | null;
};

/**
 * What the catalogue says about a published item as a dependency (031, 044): its type, listed
 * version, description and the tools it installs in (026).
 */
export type DependencyFacts = {
  type: ItemType;
  /** The listed version: `latest`'s, else the newest release. */
  version: string;
  description: string;
  /** The AI tools it installs in, by name. */
  tools: string[];
};

export const factsOf = (entry: CatalogueEntry): DependencyFacts => ({
  type: entry.type,
  version: entry.version,
  description: entry.description,
  tools: RENDERERS.filter((r) => installsIn(entry.support[r.id])).map((r) => r.name),
});
