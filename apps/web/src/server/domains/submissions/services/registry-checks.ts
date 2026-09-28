import {
  DEPENDENCY_TYPES,
  highestMatching,
  type ItemType,
  type ManifestIssue,
  mayDependOn,
  parseItemName,
} from "@ronneai/core";
import {
  DependencyCycleError,
  DependencyNotFoundError,
  DependencyRangeUnmatchedError,
  DependencyTypeNotAllowedError,
  ItemNameTakenError,
  type SubmissionsError,
} from "../exceptions/errors";
import { MANIFEST_PATH } from "../models/submission";
import type {
  PublishedItem,
  PublishedVersion,
  RegistryLookup,
} from "../repositories/registry-lookup";

/** A registry problem as one of 011's issues, so submit lists them all in one place. */
const issue = (code: string, error: SubmissionsError, path?: string): ManifestIssue => ({
  severity: "error",
  code,
  message: error.message,
  file: MANIFEST_PATH,
  path,
});

/**
 * The name is free (manifest spec §6, layer 3): no published item has it, and no open submission
 * (submitted, changes requested or approved) by anyone else proposes it. Drafts don't hold names.
 */
export const nameIssues = async (
  registry: RegistryLookup,
  input: { scope: string; name: string; proposedElsewhere: boolean },
): Promise<ManifestIssue[]> => {
  const itemName = `@${input.scope}/${input.name}`;
  if (await registry.findItem(input.scope, input.name))
    return [issue("name_taken", new ItemNameTakenError(itemName, "published"), "/name")];
  if (input.proposedElsewhere)
    return [issue("name_taken", new ItemNameTakenError(itemName, "submission"), "/name")];
  return [];
};

type Resolved = { item: PublishedItem; version: PublishedVersion };

/**
 * Each dependency exists, has a type this item may depend on (manifest spec §3), and its range
 * matches a published, non-yanked version. Then no cycles: following each dependency's highest
 * matching version (what the resolver installs, MVP §4.3), nothing leads back to this item or
 * round in a circle.
 */
export const dependencyIssues = async (
  registry: RegistryLookup,
  input: { itemName: string; type: ItemType; dependencies: Readonly<Record<string, string>> },
): Promise<ManifestIssue[]> => {
  const cache = new Map<string, Resolved | null>();
  const resolve = async (dependency: string, range: string): Promise<Resolved | null> => {
    const key = `${dependency}@${range}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const parsed = parseItemName(dependency);
    const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
    let resolved: Resolved | null = null;
    if (item) {
      const versions = (await registry.publishedVersions(item.id)).filter((v) => !v.yanked);
      const best = highestMatching(
        versions.map((v) => v.version),
        range,
      );
      const version = versions.find((v) => v.version === best);
      if (version) resolved = { item, version };
    }
    cache.set(key, resolved);
    return resolved;
  };

  const issues: ManifestIssue[] = [];
  for (const [dependency, range] of Object.entries(input.dependencies)) {
    const parsed = parseItemName(dependency);
    const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
    if (!item) {
      issues.push(
        issue("dependency_not_found", new DependencyNotFoundError(dependency), "/dependencies"),
      );
      continue;
    }
    if (!mayDependOn(input.type, item.type))
      issues.push(
        issue(
          "dependency_type",
          new DependencyTypeNotAllowedError(
            dependency,
            item.type,
            input.type,
            DEPENDENCY_TYPES[input.type],
          ),
          "/dependencies",
        ),
      );
    if (!(await resolve(dependency, range)))
      issues.push(
        issue(
          "dependency_range",
          new DependencyRangeUnmatchedError(dependency, range),
          "/dependencies",
        ),
      );
  }
  if (issues.length > 0) return issues;

  // Depth first through the versions that would be installed. `done` holds the items already
  // explored without finding a cycle, so shared dependencies are walked once.
  const done = new Set<string>();
  const walk = async (
    dependencies: Readonly<Record<string, string>>,
    path: string[],
  ): Promise<string[] | null> => {
    for (const [dependency, range] of Object.entries(dependencies)) {
      if (path.includes(dependency)) return [...path.slice(path.indexOf(dependency)), dependency];
      if (done.has(dependency)) continue;
      const resolved = await resolve(dependency, range);
      if (!resolved) continue;
      const cycle = await walk(resolved.version.dependencies, [...path, dependency]);
      if (cycle) return cycle;
      done.add(dependency);
    }
    return null;
  };
  const cycle = await walk(input.dependencies, [input.itemName]);
  return cycle ? [issue("dependency_cycle", new DependencyCycleError(cycle), "/dependencies")] : [];
};
