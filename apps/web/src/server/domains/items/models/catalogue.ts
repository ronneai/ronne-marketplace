import type { ItemType } from "@ronneai/core";
import type { ToolSupport } from "@ronneai/core/render";

/** How the catalogue sorts (feature 018): most recently published first, or by `@scope/name`. */
export type CatalogueSort = "recent" | "name";

/** One item as the catalogue and the home page list it, from its listed version. */
export type CatalogueEntry = {
  id: string;
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
  | { sort: "name"; installable: boolean; scope: string; name: string };

export type CatalogueFilter = {
  search?: string;
  type?: ItemType;
  scope?: string;
  /** A renderer id: only items whose listed version installs in that tool (026). */
  tool?: string;
};
