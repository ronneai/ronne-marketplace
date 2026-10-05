import { DEPENDENCY_TYPES, type ItemType, isItemType } from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import type { CatalogueEntry } from "../../items/models/catalogue";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import { API_PAGE_MAX, CATALOGUE_SEARCH_MAX_LENGTH } from "../../items/services/catalogue";
import { itemNameOf } from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";

/**
 * Finding a dependency to pick (056, 089): what the manifest form's Item field, `@` in a markdown
 * file and the canvas offer. The person's own items in any state (published, approved, in review,
 * drafts) first, then others' published items. Others' unreleased items are never offered (089).
 * Only types the item may depend on, never the item itself or one already listed.
 */
export type DependencyOption = {
  name: string;
  type: ItemType;
  status: "published" | "draft" | "submitted" | "changes_requested" | "approved";
  mine: boolean;
  description: string | null;
  /** Released, installable versions, newest first; empty for an unreleased item. */
  versions: string[];
  /** The version `latest` points to now, or null when unreleased. */
  latest: string | null;
};

export type DependencySearchDeps = {
  repo: SubmissionRepository;
  registry: RegistryLookup;
  catalogue: CatalogueRepository;
};

/** How many options the list shows at a time. */
export const DEPENDENCY_OPTIONS_MAX = 12;

export const findDependencies = async (
  deps: DependencySearchDeps,
  actor: { user: CurrentUser | null; ip: string | null },
  input: { type: ItemType; q: string; itemName?: string; exclude?: readonly string[] },
): Promise<DependencyOption[]> => {
  requirePermission(actor.user, "submissions.create");
  const allowed: readonly ItemType[] = isItemType(input.type) ? DEPENDENCY_TYPES[input.type] : [];
  if (allowed.length === 0 || !actor.user) return [];
  const me = actor.user.id;
  const q = String(input.q ?? "")
    .trim()
    .slice(0, CATALOGUE_SEARCH_MAX_LENGTH);
  const skip = new Set([input.itemName ?? "", ...(input.exclude ?? [])]);
  const options: DependencyOption[] = [];
  const room = () => DEPENDENCY_OPTIONS_MAX - options.length;
  // Enough rows to fill the list past what's skipped, within the API's page limit.
  const scan = Math.min(DEPENDENCY_OPTIONS_MAX + skip.size, API_PAGE_MAX);

  const addPublished = async (entries: readonly CatalogueEntry[], mine: boolean) => {
    for (const entry of entries) {
      const name = `@${entry.scope}/${entry.name}`;
      if (room() <= 0) break;
      if (skip.has(name)) continue;
      const versions = (await deps.registry.publishedVersions(entry.id))
        .filter((v) => !v.yanked)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map((v) => v.version);
      options.push({
        name,
        type: entry.type,
        status: "published",
        mine,
        description: entry.description || null,
        versions,
        latest: entry.version,
      });
      skip.add(name);
    }
  };
  const published = (ownerId?: string) =>
    deps.catalogue.list({
      search: q || undefined,
      types: allowed,
      installable: true,
      ownerId,
      sort: "recent",
      limit: scan,
    });

  // Yours first, whatever their rank in the catalogue: published, then on their way.
  await addPublished(await published(me), true);
  const own = await deps.repo.listOwnUnreleased({
    authorId: me,
    types: allowed,
    search: q,
    limit: scan,
  });
  for (const submission of own) {
    const name = itemNameOf(submission);
    if (room() <= 0) break;
    if (skip.has(name)) continue;
    options.push({
      name,
      type: submission.type,
      status: submission.status as DependencyOption["status"],
      mine: true,
      description: null,
      versions: [],
      latest: null,
    });
    skip.add(name);
  }
  // Then everyone's published items.
  if (room() > 0) await addPublished(await published(), false);
  return options;
};
