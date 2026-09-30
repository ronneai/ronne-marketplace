import { createHash } from "node:crypto";
import { DEFAULT_LIMITS, type PackageLimits } from "@ronneai/core";
import { type PackageFile, PackError, unpackItem } from "@ronneai/core/pack";
import type { StorageAdapter } from "../../../storage";
import type { ItemVersion } from "../models/item";

/**
 * A published version's files, read back from its artifact and checked against its sha256, sorted
 * by path. Null when the artifact is missing, doesn't match, or can't be unpacked: each caller says
 * so in its own words. Reading is not a download (019 counts those).
 */
export const artifactFiles = async (
  deps: { storage: StorageAdapter; limits?: PackageLimits },
  version: Pick<ItemVersion, "artifactPath" | "sha256">,
): Promise<PackageFile[] | null> => {
  const tgz = await deps.storage.get(version.artifactPath);
  if (!tgz || createHash("sha256").update(tgz).digest("hex") !== version.sha256) return null;
  try {
    return unpackItem(tgz, deps.limits ?? DEFAULT_LIMITS).sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
  } catch (error) {
    if (error instanceof PackError) return null;
    throw error;
  }
};
