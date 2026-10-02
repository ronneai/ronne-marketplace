import {
  DEPENDENCY_TYPES,
  hasErrors,
  highestMatching,
  type ItemType,
  type ManifestIssue,
  mayDependOn,
  parseItemName,
  parseManifest,
} from "@ronneai/core";
import {
  DependencyClosedError,
  DependencyCycleError,
  DependencyNotFoundError,
  DependencyRangeUnmatchedError,
  DependencyTypeNotAllowedError,
  DependencyUnreleasedError,
  ItemNameTakenError,
  type SubmissionsError,
  TypeChangedError,
} from "../exceptions/errors";
import { OPEN_STATUSES } from "../models/status";
import {
  type DraftFile,
  fileBytes,
  itemNameOf,
  MANIFEST_PATH,
  type Submission,
} from "../models/submission";
import type {
  NamedSubmission,
  PublishedItem,
  PublishedVersion,
  RegistryLookup,
} from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";

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

/**
 * A change proposal (017) keeps its item's type (manifest spec §6, layer 3). The draft's own type is
 * fixed, and 011's checks already hold the manifest to it; this compares it with the published item.
 */
export const typeIssues = async (
  registry: RegistryLookup,
  submission: { scope: { name: string }; name: string; type: ItemType },
): Promise<ManifestIssue[]> => {
  const item = await registry.findItem(submission.scope.name, submission.name);
  return item && item.type !== submission.type
    ? [
        issue(
          "type_changed",
          new TypeChangedError(`@${item.scope}/${item.name}`, item.type, submission.type),
          "/type",
        ),
      ]
    : [];
};

type Resolved = { item: PublishedItem; version: PublishedVersion };

/** How an open submission's status reads in a check's message and a mark (056). */
export const wayLabel = (status: NamedSubmission["status"]): string =>
  status === "submitted"
    ? "in review"
    : status === "changes_requested"
      ? "back with its author for changes"
      : status;

/** A dependency on its way (056): the name's open submissions, or why there's none. */
type OnItsWay = { open: NamedSubmission[]; closed: "rejected" | "withdrawn" | null };

const warning = (code: string, message: string): ManifestIssue => ({
  severity: "warning",
  code,
  message,
  file: MANIFEST_PATH,
  path: "/dependencies",
});

/**
 * Each dependency exists, has a type this item may depend on (manifest spec §3), and its range
 * matches a published, non-yanked version. Then no cycles: following each dependency's highest
 * matching version (what the resolver installs, MVP §4.3), nothing leads back to this item or
 * round in a circle.
 *
 * Since 056, at submit (`release: false`), a dependency that isn't released but has an open
 * submission is on its way: it passes with a warning, its type is the submission's, and the range
 * waits for the release, where it's checked (`release: true`) against the version it got. A draft
 * doesn't count; a rejected or withdrawn one says so.
 */
export const dependencyIssues = async (
  registry: RegistryLookup,
  input: { itemName: string; type: ItemType; dependencies: Readonly<Record<string, string>> },
  options: { release?: boolean } = {},
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
  const ways = new Map<string, OnItsWay>();
  const onItsWay = async (dependency: string): Promise<OnItsWay> => {
    const known = ways.get(dependency);
    if (known) return known;
    const parsed = parseItemName(dependency);
    const all = parsed ? await registry.submissionsNamed(parsed.scope, parsed.name) : [];
    const open = all.filter((s) => OPEN_STATUSES.includes(s.status));
    const newest = all[0]?.status;
    const way: OnItsWay = {
      open,
      closed:
        open.length === 0 && (newest === "rejected" || newest === "withdrawn") ? newest : null,
    };
    ways.set(dependency, way);
    return way;
  };

  const issues: ManifestIssue[] = [];
  for (const [dependency, range] of Object.entries(input.dependencies)) {
    const parsed = parseItemName(dependency);
    const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
    const resolved = item ? await resolve(dependency, range) : null;
    const way = resolved ? { open: [], closed: null } : await onItsWay(dependency);
    const pending = way.open[0];
    if (!item && !pending) {
      issues.push(
        way.closed
          ? issue(
              "dependency_closed",
              new DependencyClosedError(dependency, way.closed),
              "/dependencies",
            )
          : issue("dependency_not_found", new DependencyNotFoundError(dependency), "/dependencies"),
      );
      continue;
    }
    const type = item?.type ?? pending?.type;
    if (type && !mayDependOn(input.type, type))
      issues.push(
        issue(
          "dependency_type",
          new DependencyTypeNotAllowedError(
            dependency,
            type,
            input.type,
            DEPENDENCY_TYPES[input.type],
          ),
          "/dependencies",
        ),
      );
    if (resolved) continue;
    if (!pending) {
      issues.push(
        issue(
          "dependency_range",
          new DependencyRangeUnmatchedError(dependency, range),
          "/dependencies",
        ),
      );
      continue;
    }
    if (options.release) {
      issues.push(
        issue(
          "dependency_unreleased",
          new DependencyUnreleasedError(dependency, wayLabel(pending.status)),
          "/dependencies",
        ),
      );
      continue;
    }
    issues.push(
      warning(
        "dependency_pending",
        `${dependency} isn't released yet; it's ${wayLabel(pending.status)}. ${input.itemName} can be released after it.`,
      ),
    );
    // A new item's first stable release is 1.0.0: say now if the range can't take it.
    if (!item && !highestMatching(["1.0.0"], range))
      issues.push(
        warning(
          "dependency_range_pending",
          `${dependency}'s first release will be 1.0.0, which ${range} doesn't match.`,
        ),
      );
  }
  if (hasErrors(issues)) return issues;

  // Depth first through the versions that would be installed, or, for a dependency on its way,
  // its submission's latest revision. `done` holds the items already explored without finding a
  // cycle, so shared dependencies are walked once.
  const next = async (dependency: string, range: string) => {
    const resolved = await resolve(dependency, range);
    if (resolved) return resolved.version.dependencies;
    return options.release ? null : ((await onItsWay(dependency)).open[0]?.dependencies ?? null);
  };
  const done = new Set<string>();
  const walk = async (
    dependencies: Readonly<Record<string, string>>,
    path: string[],
  ): Promise<string[] | null> => {
    for (const [dependency, range] of Object.entries(dependencies)) {
      if (path.includes(dependency)) return [...path.slice(path.indexOf(dependency)), dependency];
      if (done.has(dependency)) continue;
      const below = await next(dependency, range);
      if (!below) continue;
      const cycle = await walk(below, [...path, dependency]);
      if (cycle) return cycle;
      done.add(dependency);
    }
    return null;
  };
  const cycle = await walk(input.dependencies, [input.itemName]);
  return cycle
    ? [...issues, issue("dependency_cycle", new DependencyCycleError(cycle), "/dependencies")]
    : issues;
};

/**
 * What Submit (013) checks against the registry: the name, or a proposal's type, then the
 * dependencies ronne.yaml lists (none when it doesn't parse). Submit runs it once 011's checks
 * pass; an upload (037) runs it straight away, as advice. A release (015) runs it with `release`,
 * so every dependency has to be released by then (056).
 */
export const registryIssues = async (
  repo: SubmissionRepository,
  registry: RegistryLookup,
  submission: Submission,
  files: readonly Omit<DraftFile, "updatedAt">[],
  options: { release?: boolean } = {},
): Promise<ManifestIssue[]> => {
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;
  const dependencies = (manifest?.dependencies ?? {}) as Record<string, string>;
  return [
    // A change proposal (017) is for its item: it needs no free name, but keeps the item's type.
    ...(submission.proposal
      ? await typeIssues(registry, submission)
      : await nameIssues(registry, {
          scope: submission.scope.name,
          name: submission.name,
          proposedElsewhere: await repo.isNameProposed(
            submission.scope.id,
            submission.name,
            OPEN_STATUSES,
            submission.id,
          ),
        })),
    ...(await dependencyIssues(
      registry,
      {
        itemName: itemNameOf(submission),
        type: submission.type,
        dependencies,
      },
      options,
    )),
  ];
};
