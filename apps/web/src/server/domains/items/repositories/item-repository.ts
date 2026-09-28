import type { ItemType } from "@ronneai/core";
import type { Item, ItemVersion, NewItemVersion } from "../models/item";

/** What releases (015) and the registry lookup need from storage. Kysely in kysely-item-repository.ts. */
export interface ItemRepository {
  /** By scope name and item name, as `@scope/name` reads. */
  findByName(scope: string, name: string): Promise<Item | null>;
  insertItem(item: {
    scopeId: string;
    name: string;
    type: ItemType;
    description: string;
    ownerId: string | null;
    createdAt: Date;
  }): Promise<string>;
  /** The item shows its latest release's description. */
  updateDescription(itemId: string, description: string): Promise<void>;
  /** Every version, yanked ones included, with its dependencies by name. */
  versions(itemId: string): Promise<ItemVersion[]>;
  insertVersion(version: NewItemVersion): Promise<string>;
  /** Points `tag` at a version; returns the version it pointed to before, or null. */
  setTag(itemId: string, tag: string, versionId: string): Promise<string | null>;
  /** Locks the item's row until the transaction ends. */
  lockItem(itemId: string): Promise<void>;
}
