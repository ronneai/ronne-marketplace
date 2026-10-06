import type { ItemType } from "@ronneai/core";
import type { SubmissionStatus } from "../models/status";

export type PublishedItem = { id: string; scope: string; name: string; type: ItemType };

export type PublishedVersion = {
  id: string;
  version: string;
  publishedAt: Date;
  /** Where its `.tgz` is, for proposals (017) that start from it. */
  artifactPath: string;
  /** The artifact's checksum, checked when it's read back. */
  sha256: string;
  yanked: boolean;
  /** The version's own dependencies, from its manifest: `@scope/name` → range. */
  dependencies: Readonly<Record<string, string>>;
};

/**
 * A submission of an item's name that isn't a draft (056). An open one (submitted, changes
 * requested, approved) is a dependency on its way; a rejected or withdrawn one says why a
 * dependency is blocked. Drafts are private and never listed.
 */
export type NamedSubmission = {
  id: string;
  status: Exclude<SubmissionStatus, "draft">;
  type: ItemType;
  /** Who wrote it: only the submitter's own counts before release (089). */
  authorId: string;
  /** A change proposal to a published item (017), rather than a new item. */
  proposal: boolean;
  /** Its latest revision's dependencies: `@scope/name` → range. */
  dependencies: Readonly<Record<string, string>>;
};

/**
 * What the registry checks (spec 013) need to know about published items. Releases (015) create
 * items and versions; the repository's `registry()` reads those tables (015), and the
 * checks don't change.
 */
export interface RegistryLookup {
  findItem(scope: string, name: string): Promise<PublishedItem | null>;
  publishedVersions(itemId: string): Promise<PublishedVersion[]>;
  /** The name's submissions that aren't drafts, newest change first (056). */
  submissionsNamed(scope: string, name: string): Promise<NamedSubmission[]>;
}

/** A registry with nothing published: for tests. The app uses `kyselyRegistryLookup` (015). */
export const unreleasedRegistry: RegistryLookup = {
  findItem: async () => null,
  publishedVersions: async () => [],
  submissionsNamed: async () => [],
};
