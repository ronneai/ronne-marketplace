import type { ItemType } from "@ronneai/core";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { Item, ItemVersion, NewItemVersion, VersionDetail } from "../models/item";

/**
 * What releases (015) and version management (016) need from storage. Kysely in
 * kysely-item-repository.ts. Every change to versions or tags also refreshes the item's catalogue
 * listing (018, `models/listing.ts`), so no caller can forget it.
 */
export interface ItemRepository {
  transaction<T>(work: (repo: ItemRepository) => Promise<T>): Promise<T>;
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
  /** Every tag of the item, with the version it points to. */
  tags(itemId: string): Promise<{ tag: string; versionId: string }[]>;
  removeTag(itemId: string, tag: string): Promise<void>;
  setDeprecated(versionId: string, message: string | null): Promise<void>;
  /** Yanks (`at` and a reason) or unyanks (nulls) a version. */
  setYanked(versionId: string, yanked: { at: Date; reason: string } | null): Promise<void>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
  /** A version's manifest, README, files and risk flags, for its page (018). */
  versionDetail(versionId: string): Promise<VersionDetail | null>;
  /** A user's display name, or null if they're gone. */
  userName(userId: string): Promise<string | null>;
}
