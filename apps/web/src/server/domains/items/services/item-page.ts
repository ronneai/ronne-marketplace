import { formatItemName } from "@ronneai/core";
import { ItemNotFoundError, VersionNotFoundError } from "../exceptions/errors";
import type { Approval, Dependent, VersionDetail } from "../models/item";
import { listingOf } from "../models/listing";
import {
  type ItemRef,
  listVersions,
  type VersionActor,
  type VersionDeps,
  type VersionRow,
  type VersionsPage,
} from "./versions";

/**
 * An item's page (feature 018): the version it shows, `?version=` or the listed one (`latest`'s, else
 * the newest), with its README, files, dependencies and risk flags, and 016's versions and tags.
 * Everyone signed in reads it; a missing item, or a version it doesn't have, is not found.
 */
export type ItemPage = VersionsPage & {
  /** The version shown, with what its page needs, and who approved it (045). */
  shown: VersionRow & VersionDetail & { approval: Approval | null };
  /** Published items whose listed version depends on this one (045). */
  usedBy: Dependent[];
  /** The version the catalogue lists; the page says when it shows another. */
  listed: string;
  /** Where `latest` points, or null. */
  latest: string | null;
  installable: boolean;
  ownerName: string | null;
};

export const itemPage = async (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  version?: string,
): Promise<ItemPage> => {
  const page = await listVersions(deps, actor, ref);
  const latest = page.tags.find((t) => t.tag === "latest")?.version ?? null;
  const listing = listingOf(
    page.versions,
    page.versions.find((v) => v.version === latest)?.id ?? null,
  );
  const listed = page.versions.find((v) => v.id === listing.listedVersionId);
  const row = version ? page.versions.find((v) => v.version === version) : listed;
  // An item without a published version isn't in the catalogue, and has no page either.
  if (!listed) throw new ItemNotFoundError(formatItemName(ref));
  if (!row) throw new VersionNotFoundError(formatItemName(ref), version ?? "latest");
  const detail = await deps.items.versionDetail(row.id);
  if (!detail) throw new VersionNotFoundError(formatItemName(ref), row.version);
  return {
    ...page,
    shown: {
      ...row,
      ...detail,
      approval: detail.submissionId ? await deps.items.approval(detail.submissionId) : null,
    },
    usedBy: await deps.items.dependents(page.item.id),
    listed: listed.version,
    latest,
    installable: listing.installable,
    ownerName: page.item.ownerId ? await deps.items.userName(page.item.ownerId) : null,
  };
};
