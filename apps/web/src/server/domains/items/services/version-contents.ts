import type { PackageLimits } from "@ronneai/core";
import { formatItemName } from "@ronneai/core";
import type { StorageAdapter } from "../../../storage";
import { ArtifactUnavailableError } from "../exceptions/errors";
import { type ContentFile, toContentFile } from "../models/contents";
import { artifactFiles } from "./artifact-files";
import { findDownload } from "./downloads";
import type { ItemRef, VersionActor, VersionDeps } from "./versions";

/**
 * A published version's files with their contents, for its item page (feature 044): exactly what
 * `rmk install` receives, `ronne.yaml` as released. Everyone signed in may read any version, yanked
 * ones included, like the rest of the page. It isn't counted as a download.
 */
export type ContentsDeps = VersionDeps & { storage: StorageAdapter; limits?: PackageLimits };

export const versionContents = async (
  deps: ContentsDeps,
  actor: VersionActor,
  ref: ItemRef,
  version: string,
): Promise<ContentFile[]> => {
  const found = await findDownload(deps, actor, ref, version);
  const files = await artifactFiles(deps, found.version);
  if (!files) throw new ArtifactUnavailableError(formatItemName(ref), version);
  return files.map(toContentFile);
};
