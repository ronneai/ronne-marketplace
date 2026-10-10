import { createHash } from "node:crypto";
import { formatItemName } from "@ronneai/core";
import type { StorageAdapter } from "../../../storage";
import { requirePermission } from "../../identity/models/permissions";
import {
  ArtifactUnavailableError,
  ItemNotFoundError,
  VersionNotFoundError,
} from "../exceptions/errors";
import type { ItemVersion } from "../models/item";
import type { ItemRef, VersionActor, VersionDeps } from "./versions";

/**
 * Serving a version's artifact (feature 019). Everyone signed in may download any published
 * version, yanked ones included, since a lockfile may pin one (MVP §4.3). Each download adds one to
 * the item's count; nothing about who downloaded is stored.
 */
export type DownloadDeps = VersionDeps & { storage: StorageAdapter };

const nameOf = (ref: ItemRef) => formatItemName(ref);

/** The version a download is for, without reading the artifact: for HEAD and `If-None-Match`. */
export const findDownload = async (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  version: string,
): Promise<{ itemId: string; version: ItemVersion }> => {
  requirePermission(actor.user, "account.manage_own");
  const item = await deps.items.findByName(ref);
  if (!item) throw new ItemNotFoundError(nameOf(ref));
  const found = (await deps.items.versions(item.id)).find((v) => v.version === version);
  if (!found) throw new VersionNotFoundError(nameOf(ref), version);
  return { itemId: item.id, version: found };
};

/** The artifact's bytes, checked against the version's sha256, and counted. */
export const downloadArtifact = async (
  deps: DownloadDeps,
  actor: VersionActor,
  ref: ItemRef,
  version: string,
): Promise<{ bytes: Uint8Array; sha256: string; size: number }> => {
  const found = await findDownload(deps, actor, ref, version);
  const bytes = await deps.storage.get(found.version.artifactPath);
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== found.version.sha256)
    throw new ArtifactUnavailableError(nameOf(ref), version);
  await deps.items.countDownload(found.itemId);
  return { bytes, sha256: found.version.sha256, size: bytes.length };
};
