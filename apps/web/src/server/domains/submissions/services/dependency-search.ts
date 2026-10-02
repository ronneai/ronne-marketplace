import { DEPENDENCY_TYPES, type ItemType, isItemType } from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import { CATALOGUE_SEARCH_MAX_LENGTH, searchCatalogue } from "../../items/services/catalogue";
import { OPEN_STATUSES } from "../models/status";
import { itemNameOf, type Submission } from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";

/**
 * Finding a dependency to pick (056): what the manifest form's Item field and `@` in a markdown
 * file offer. Published items, the person's own items still on their way (drafts too), and
 * others' items in review or approved, which count as dependencies since 056. Only types the
 * item may depend on, never the item itself or one already listed.
 */
export type DependencyOption = {
  name: string;
  type: ItemType;
  status: "published" | "draft" | "submitted" | "changes_requested" | "approved";
  mine: boolean;
  /** Who it's by, for one in review that isn't the person's. */
  author: string | null;
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
/** How many open submissions are looked through, as the review queue's own limit. */
const OPEN_SCAN = 500;

/** Whether `@scope/name` matches what was typed (the catalogue's own rule, in memory). */
const nameMatches = (name: string, query: string) => {
  const words = query.toLowerCase().replace(/^@/, "");
  if (!words) return true;
  const [scope, item] = name.toLowerCase().slice(1).split("/") as [string, string];
  const slash = words.indexOf("/");
  return slash >= 0
    ? scope.includes(words.slice(0, slash)) && item.includes(words.slice(slash + 1))
    : scope.includes(words) || item.includes(words);
};

export const findDependencies = async (
  deps: DependencySearchDeps,
  actor: { user: CurrentUser | null; ip: string | null },
  input: { type: ItemType; q: string; itemName?: string; exclude?: readonly string[] },
): Promise<DependencyOption[]> => {
  requirePermission(actor.user, "submissions.create");
  const allowed: readonly ItemType[] = isItemType(input.type) ? DEPENDENCY_TYPES[input.type] : [];
  if (allowed.length === 0) return [];
  const q = String(input.q ?? "")
    .trim()
    .slice(0, CATALOGUE_SEARCH_MAX_LENGTH);
  const skip = new Set([input.itemName ?? "", ...(input.exclude ?? [])]);
  const options: DependencyOption[] = [];

  const { entries } = await searchCatalogue({ catalogue: deps.catalogue }, actor, {
    q,
    types: allowed,
    installable: true,
    sort: "recent",
    limit: DEPENDENCY_OPTIONS_MAX,
  });
  for (const entry of entries) {
    const name = `@${entry.scope}/${entry.name}`;
    if (skip.has(name)) continue;
    const versions = (await deps.registry.publishedVersions(entry.id))
      .filter((v) => !v.yanked)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((v) => v.version);
    options.push({
      name,
      type: entry.type,
      status: "published",
      mine: false,
      author: null,
      description: entry.description || null,
      versions,
      latest: entry.version,
    });
    skip.add(name);
  }

  // Items on their way: the person's own drafts, then everyone's open submissions, newest first.
  const own = (await deps.repo.listByAuthor(actor.user?.id ?? "")).filter(
    (s) => s.status === "draft",
  );
  const open = await deps.repo.listForReview({
    statuses: OPEN_STATUSES,
    order: "newest",
    limit: OPEN_SCAN,
  });
  const candidates: (Submission & { authorName?: string })[] = [...open, ...own];
  for (const submission of candidates) {
    if (options.length >= DEPENDENCY_OPTIONS_MAX) break;
    const name = itemNameOf(submission);
    // A proposal's item is published: it's offered as published, when it matches.
    if (submission.proposal || skip.has(name)) continue;
    if (!allowed.includes(submission.type) || !nameMatches(name, q)) continue;
    const mine = submission.authorId === actor.user?.id;
    options.push({
      name,
      type: submission.type,
      status: submission.status as DependencyOption["status"],
      mine,
      author: mine ? null : (submission.authorName ?? null),
      description: null,
      versions: [],
      latest: null,
    });
    skip.add(name);
  }
  return options.slice(0, DEPENDENCY_OPTIONS_MAX);
};
