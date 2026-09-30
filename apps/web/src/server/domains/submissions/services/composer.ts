import { type ItemType, isItemType, isVersionRange, parseItemName } from "@ronneai/core";
import { installsIn, RENDERERS } from "@ronneai/core/render";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import type { CatalogueEntry } from "../../items/models/catalogue";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import {
  DEPENDENCY_REPORTS_MAX,
  type DependencyFacts,
  type DependencyReport,
} from "../models/composer";
import type { RegistryLookup } from "../repositories/registry-lookup";
import { dependencyIssues } from "./registry-checks";

/**
 * What the visual composer (feature 031) reads from the registry. Anyone who may write a draft may
 * ask; it says nothing the catalogue doesn't.
 */
export type ComposerDeps = { registry: RegistryLookup; catalogue: CatalogueRepository };
export type ComposerActor = { user: CurrentUser | null; ip: string | null };

export const factsOf = (entry: CatalogueEntry): DependencyFacts => ({
  type: entry.type,
  version: entry.version,
  description: entry.description,
  tools: RENDERERS.filter((r) => installsIn(entry.support[r.id])).map((r) => r.name),
});

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
