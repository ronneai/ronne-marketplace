import type { ItemType, RiskFlag } from "@ronneai/core";

/** A published item (feature 015): created by its first release. */
export type Item = {
  id: string;
  scope: { id: string; name: string };
  /** Its scope's workspace (090), by name. */
  workspace: string;
  /** The same workspace's id, where its versions are managed (091). */
  workspaceId: string;
  /** Whether that workspace is private (093): only its members and root see the item. */
  privateWorkspace: boolean;
  name: string;
  type: ItemType;
  description: string;
  ownerId: string | null;
  createdAt: Date;
  /** Artifact downloads through the API (018, 019). */
  downloadCount: number;
};

/** One file of a published version, as the catalogue lists it. */
export type VersionFile = { path: string; size: number; executable: boolean };

/** A published version, without its manifest and README. */
export type ItemVersion = {
  id: string;
  itemId: string;
  version: string;
  sha256: string;
  size: number;
  /** Where its `.tgz` is in the StorageAdapter. */
  artifactPath: string;
  publishedAt: Date;
  yankedAt: Date | null;
  yankReason: string | null;
  deprecatedMessage: string | null;
  publishedBy: string;
  /** The publisher's name, or null if the user is gone. */
  publishedByName: string | null;
  /** `@scope/name` → range, from the version's manifest. */
  dependencies: Record<string, string>;
  /** The AI tools its manifest turns off (026). */
  disabledTargets: string[];
};

export type NewItemVersion = {
  itemId: string;
  version: string;
  manifest: unknown;
  readme: string | null;
  files: VersionFile[];
  notes: string | null;
  artifactPath: string;
  sha256: string;
  size: number;
  publishedBy: string;
  publishedAt: Date;
  /** The submission it was released from; null for versions made outside the review flow. */
  submissionId: string | null;
  /** Resolved to item ids, as `version_dependencies` stores them. */
  dependencies: { itemId: string; range: string }[];
  /** What it can do (014), from the files it was released with; the catalogue shows them (018). */
  riskFlags: RiskFlag[];
};

/** What an item page shows of one version (feature 018), beyond its row in the list. */
export type VersionDetail = {
  manifest: Record<string, unknown>;
  readme: string | null;
  files: VersionFile[];
  notes: string | null;
  riskFlags: RiskFlag[];
  /** The submission it was released from (015); null when it wasn't released through review. */
  submissionId: string | null;
};

/** A published item whose listed version depends on another, with the range it asks for (045). */
export type Dependent = {
  scope: string;
  name: string;
  type: ItemType;
  /** Its listed version. */
  version: string;
  range: string;
};

/**
 * Who approved a version's submission (014, 045): the latest `approve` or root's `override`. `by`
 * is null when that user is gone.
 */
export type Approval = { by: string | null; at: Date; override: boolean };
