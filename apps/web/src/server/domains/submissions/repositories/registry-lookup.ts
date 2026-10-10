import type { ItemType } from "@ronneai/core";
import type { ItemRef } from "../../items/models/item";
import type { SubmissionStatus } from "../models/status";

/** A workspace as the dependency rule needs it (093): which one, and whether it's private. */
export type DependencyWorkspace = { id: string; private: boolean };

export type PublishedItem = {
  id: string;
  /**
   * Its full name now (118). Differs from the name it was asked by when that was an old name, an
   * alias kept for it.
   */
  fullName: string;
  scope: string;
  name: string;
  type: ItemType;
  /** Its scope's workspace (093): a private one's items are dependencies only inside it. */
  workspace: DependencyWorkspace;
};

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
  /** Its scope's workspace (093). */
  workspace: DependencyWorkspace;
};

/**
 * What the registry checks (spec 013) need to know about published items. Releases (015) create
 * items and versions; the repository's `registry()` reads those tables (015), and the
 * checks don't change.
 */
export interface RegistryLookup {
  /** By its name now, or an old name it had (118), as the viewer sees it. */
  findItem(ref: ItemRef): Promise<PublishedItem | null>;
  /** Whether a full name is any item's old name (118), seen or not: it's reserved for everyone. */
  isOldName(name: string): Promise<boolean>;
  publishedVersions(itemId: string): Promise<PublishedVersion[]>;
  /** The name's submissions that aren't drafts, newest change first (056). */
  submissionsNamed(ref: ItemRef): Promise<NamedSubmission[]>;
  /**
   * The author's own draft of the name, newest first, with what its saved `ronne.yaml` depends on:
   * it goes with what depends on it (112). Nobody else's: a draft is private to its author.
   */
  ownDraftNamed(ref: ItemRef, authorId: string): Promise<OwnDraft | null>;
  /** Which of these workspaces are private (093): for ids the caller already holds. */
  privateWorkspaces(ids: readonly string[]): Promise<ReadonlySet<string>>;
}

/** An author's own draft of a dependency (112), as the checks see it. */
export type OwnDraft = {
  id: string;
  type: ItemType;
  dependencies: Readonly<Record<string, string>>;
  workspace: DependencyWorkspace;
};

/** A registry with nothing published: for tests. The app uses `kyselyRegistryLookup` (015). */
export const unreleasedRegistry: RegistryLookup = {
  findItem: async () => null,
  isOldName: async () => false,
  publishedVersions: async () => [],
  submissionsNamed: async () => [],
  ownDraftNamed: async () => null,
  privateWorkspaces: async () => new Set(),
};
