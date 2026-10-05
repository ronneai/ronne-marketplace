import {
  DEPENDENCY_TYPES,
  type ItemType,
  isItemType,
  isVersionRange,
  parseItemName,
} from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { factsOf } from "../../items/models/catalogue";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import { CATALOGUE_SEARCH_MAX_LENGTH, searchCatalogue } from "../../items/services/catalogue";
import {
  DEPENDENCY_REPORTS_MAX,
  type DependencyReport,
  PICKER_PAGE_SIZE,
  type PickerPage,
} from "../models/composer";
import type { RegistryLookup } from "../repositories/registry-lookup";
import { dependencyIssues } from "./registry-checks";

/**
 * What the visual composer (feature 031) reads from the registry. Anyone who may write a draft may
 * ask; it says nothing the catalogue doesn't.
 */
export type ComposerDeps = { registry: RegistryLookup; catalogue: CatalogueRepository };
export type ComposerActor = { user: CurrentUser | null; ip: string | null };

/**
 * Each dependency's catalogue facts and 013's problems with it, by name: the checks a submission
 * runs, one dependency at a time, so every node shows its own. A range that isn't a semver range is
 * 011's problem, which the editor already shows, so "no version matches" isn't added to it.
 * Reports on the first `DEPENDENCY_REPORTS_MAX`.
 */
export const dependencyReports = async (
  deps: ComposerDeps,
  actor: ComposerActor,
  input: { itemName: string; type: ItemType; dependencies: Readonly<Record<string, string>> },
): Promise<Record<string, DependencyReport>> => {
  requirePermission(actor.user, "submissions.create");
  if (!isItemType(input.type) || !input.dependencies || typeof input.dependencies !== "object")
    return {};
  const entries = Object.entries(input.dependencies)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .slice(0, DEPENDENCY_REPORTS_MAX);
  const listed = new Map(
    (
      await deps.catalogue.byNames(
        entries.flatMap(([name]) => {
          const parsed = parseItemName(name);
          return parsed ? [parsed] : [];
        }),
      )
    ).map((entry) => [`@${entry.scope}/${entry.name}`, entry]),
  );
  const reports: [string, DependencyReport][] = [];
  for (const [name, range] of entries) {
    const entry = listed.get(name);
    const issues = await dependencyIssues(deps.registry, {
      itemName: String(input.itemName),
      type: input.type,
      dependencies: { [name]: range },
      authorId: actor.user?.id ?? "",
    });
    reports.push([
      name,
      {
        facts: entry ? factsOf(entry) : null,
        problems: issues
          .filter((issue) => issue.code !== "dependency_range" || isVersionRange(range))
          .map((issue) => issue.message),
      },
    ]);
  }
  return Object.fromEntries(reports);
};

/**
 * The catalogue for the picker: 018's search, newest first, over the types an item of `type` may
 * depend on (manifest spec §3) and only items with a version that can be installed, so everything
 * it offers would pass 013's checks. `only` narrows it to one of those types.
 */
export const searchDependencies = async (
  deps: ComposerDeps,
  actor: ComposerActor,
  input: { type: ItemType; q?: string; only?: ItemType | null; cursor?: string },
): Promise<PickerPage> => {
  requirePermission(actor.user, "submissions.create");
  const allowed = isItemType(input.type) ? DEPENDENCY_TYPES[input.type] : [];
  const types = input.only ? allowed.filter((type) => type === input.only) : allowed;
  if (types.length === 0) return { entries: [], nextCursor: null };
  const { entries, nextCursor } = await searchCatalogue({ catalogue: deps.catalogue }, actor, {
    q: String(input.q ?? "")
      .trim()
      .slice(0, CATALOGUE_SEARCH_MAX_LENGTH),
    types,
    installable: true,
    sort: "recent",
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: PICKER_PAGE_SIZE,
  });
  return {
    entries: entries.map((entry) => ({
      name: `@${entry.scope}/${entry.name}`,
      ...factsOf(entry),
    })),
    nextCursor,
  };
};
