import type { ItemType } from "@ronneai/core";

/** A published item (feature 015): created by its first release. */
export type Item = {
  id: string;
  scope: { id: string; name: string };
  name: string;
  type: ItemType;
  description: string;
  ownerId: string | null;
  createdAt: Date;
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
  publishedAt: Date;
  yankedAt: Date | null;
  deprecatedMessage: string | null;
  /** `@scope/name` → range, from the version's manifest. */
  dependencies: Record<string, string>;
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
  submissionId: string;
  /** Resolved to item ids, as `version_dependencies` stores them. */
  dependencies: { itemId: string; range: string }[];
};
