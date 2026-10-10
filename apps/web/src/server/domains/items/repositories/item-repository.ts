import type { ItemType } from "@ronneai/core";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type {
  Approval,
  Dependent,
  Item,
  ItemRef,
  ItemVersion,
  NewItemVersion,
  VersionDetail,
} from "../models/item";

/**
 * What releases (015) and version management (016) need from storage. Kysely in
 * kysely-item-repository.ts. Every change to versions or tags also refreshes the item's catalogue
 * listing (018, `models/listing.ts`), and every change that can change a plugin feed (a release, a
 * tag, a deprecation, a yank, a description) raises the catalogue revision (079), so no caller can
 * forget either.
 */
export interface ItemRepository {
  transaction<T>(work: (repo: ItemRepository) => Promise<T>): Promise<T>;
  /**
   * By its full name (118): the workspace, scope and name it has now, or else one of its old names
   * (`item_aliases`). Either way only an item the viewer sees (093), so an old name tells nobody
   * else where it went.
   */
  findByName(ref: ItemRef): Promise<Item | null>;
  /**
   * Whether a full name is an old name of an item (118), whoever sees it: an old name is reserved
   * for everyone, so drafts, releases, moves (115) and renames (113) can refuse it. Says nothing
   * about which item had it.
   */
  isOldName(name: string): Promise<boolean>;
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
  /**
   * Locks these workspaces' rows, in id order, until the transaction ends, and says which are
   * private (093): a release checks its dependencies under the lock Make private takes.
   */
  lockWorkspaces(ids: readonly string[]): Promise<ReadonlySet<string>>;
  /** A version's dependencies with their workspaces (093), for a version the viewer sees. */
  dependencyWorkspaces(versionId: string): Promise<{ name: string; workspaceId: string }[]>;
  /** Every tag of the item, with the version it points to. */
  tags(itemId: string): Promise<{ tag: string; versionId: string }[]>;
  removeTag(itemId: string, tag: string): Promise<void>;
  setDeprecated(versionId: string, message: string | null): Promise<void>;
  /** Yanks (`at` and a reason) or unyanks (nulls) a version. */
  setYanked(versionId: string, yanked: { at: Date; reason: string } | null): Promise<void>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
  /** A version's manifest, README, files and risk flags, for its page (018). */
  versionDetail(versionId: string): Promise<VersionDetail | null>;
  /** Published items whose listed version depends on `itemId`, by name (045). */
  dependents(itemId: string): Promise<Dependent[]>;
  /** The latest approval of a submission, or null if it has none (045). */
  approval(submissionId: string): Promise<Approval | null>;
  /** A user's display name, or null if they're gone. */
  userName(userId: string): Promise<string | null>;
  /** One more download of the item's artifacts (019), in a single UPDATE so none is lost. */
  countDownload(itemId: string): Promise<void>;
}
