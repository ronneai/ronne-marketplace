import {
  canonicalItemName,
  formatItemName,
  hasErrors,
  highestMatching,
  type ItemType,
  type ManifestIssue,
  parseFrontmatter,
  parseItemName,
  parseManifest,
  sameItemName,
} from "@ronneai/core";
import {
  DependencyClosedError,
  DependencyDraftError,
  DependencyNotFoundError,
  DependencyNotPublishedError,
  DependencyNotVisibleError,
  DependencyRangeUnmatchedError,
  DependencyUnreleasedError,
  ItemNameTakenError,
  type SubmissionsError,
  TypeChangedError,
} from "../exceptions/errors";
import { isEditable, OPEN_STATUSES } from "../models/status";
import {
  type DraftFile,
  fileBytes,
  itemNameOf,
  itemRefOf,
  MANIFEST_PATH,
  type Submission,
} from "../models/submission";
import type {
  NamedSubmission,
  OwnDraft,
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
 * The name is free (manifest spec §6, layer 3): no published item has it, none had it before a move
 * or a rename (118: an old name stays its item's), and no open submission (submitted, changes
 * requested or approved) by anyone else proposes it. Drafts don't hold names.
 */
export const nameIssues = async (
  registry: RegistryLookup,
  input: { workspace?: string; scope: string; name: string; proposedElsewhere: boolean },
): Promise<ManifestIssue[]> => {
  const itemName = formatItemName(input);
  const taken = await registry.findItem(input);
  if (taken)
    return [
      issue(
        "name_taken",
        new ItemNameTakenError(itemName, taken.fullName === itemName ? "published" : "alias"),
        "/name",
      ),
    ];
  // An old name of an item the submitter doesn't see is reserved too, said without naming it.
  if (await registry.isOldName(itemName))
    return [issue("name_taken", new ItemNameTakenError(itemName, "taken"), "/name")];
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
  submission: {
    workspace: { name: string };
    scope: { name: string };
    name: string;
    type: ItemType;
  },
): Promise<ManifestIssue[]> => {
  const item = await registry.findItem(itemRefOf(submission));
  return item && item.type !== submission.type
    ? [
        issue(
          "type_changed",
          new TypeChangedError(item.fullName, item.type, submission.type),
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

/**
 * A dependency on its way (056): the name's open submissions (anyone's, which the cycle walk and a
 * release go by), the submitter's own (which count at submit since 089), and why it's closed when
 * nobody's is open.
 */
type OnItsWay = {
  anyOpen: NamedSubmission[];
  mine: NamedSubmission[];
  closed: "rejected" | "withdrawn" | null;
  /** The submitter's own draft of it (112): it goes with what depends on it. */
  draft: OwnDraft | null;
};

/** The names of a cycle's items, each once: "@t/a and @t/b", "@t/a, @t/b and @t/c". */
const listed = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const warning = (code: string, message: string): ManifestIssue => ({
  severity: "warning",
  code,
  message,
  file: MANIFEST_PATH,
  path: "/dependencies",
});

/**
 * Each dependency exists (of any type since 096, manifest spec §3), and its range
 * matches a published, non-yanked version.
 *
 * Since 056, at submit (`release: false`), a dependency that isn't released but has an open
 * submission is on its way: it passes with a warning, its type is the submission's, and the range
 * waits for the release, where it's checked (`release: true`) against the version it got. A
 * rejected or withdrawn one says so. Since 089, only the submitter's own open submission counts:
 * another author's item is a dependency once it's published.
 *
 * Since 112, the submitter's own draft goes with the item: with `together` (the save's advice, the
 * canvas, Submit's group) it's a warning, `dependency_draft`; without it (the item alone) an error.
 * Items that need each other are allowed: following each dependency's highest matching version,
 * its submission's latest revision, or the submitter's own draft, a way back to this item or round
 * in a circle is a warning, `dependency_cycle`, that they go together: submitted for review while
 * one of them is still with its author, released once all are in review or approved.
 */
export const dependencyIssues = async (
  registry: RegistryLookup,
  input: {
    itemName: string;
    type: ItemType;
    dependencies: Readonly<Record<string, string>>;
    /** The submitter: their own open submissions count before release (089). */
    authorId: string;
    /**
     * The dependent's workspace (093): a dependency in another, private workspace is refused. Null
     * when it isn't known yet (no scope), which refuses every private one.
     */
    workspaceId: string | null;
    /**
     * The item is still with its author (a draft, or sent back for changes): a cycle it's in goes
     * for review next, not release (112).
     */
    editable?: boolean;
  },
  options: { release?: boolean; together?: boolean } = {},
): Promise<ManifestIssue[]> => {
  const cache = new Map<string, Resolved | null>();
  const resolve = async (dependency: string, range: string): Promise<Resolved | null> => {
    const key = `${dependency}@${range}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const parsed = parseItemName(dependency);
    const item = parsed ? await registry.findItem(parsed) : null;
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
    const all = parsed ? await registry.submissionsNamed(parsed) : [];
    const anyOpen = all.filter((s) => OPEN_STATUSES.includes(s.status));
    const newest = all[0]?.status;
    const draft = parsed ? await registry.ownDraftNamed(parsed, input.authorId) : null;
    const way: OnItsWay = {
      anyOpen,
      mine: anyOpen.filter((s) => s.authorId === input.authorId),
      closed:
        !draft && anyOpen.length === 0 && (newest === "rejected" || newest === "withdrawn")
          ? newest
          : null,
      draft,
    };
    ways.set(dependency, way);
    return way;
  };

  // An item on itself is the package checks' `self_dependency` (011): nothing more to say here.
  const dependencies = Object.fromEntries(
    Object.entries(input.dependencies).filter(
      ([dependency]) => !sameItemName(dependency, input.itemName),
    ),
  );
  const issues: ManifestIssue[] = [];
  for (const [dependency, range] of Object.entries(dependencies)) {
    const parsed = parseItemName(dependency);
    const item = parsed ? await registry.findItem(parsed) : null;
    // Found by an old name (118): it still works, but the new name is the one to keep.
    if (item && item.fullName !== canonicalItemName(dependency))
      issues.push({
        ...warning(
          "dependency_renamed",
          `${dependency} is now ${item.fullName}. It still works under its old name; use the new one.`,
        ),
        rename: { from: dependency, to: item.fullName },
      });
    const resolved = item ? await resolve(dependency, range) : null;
    const way: OnItsWay = resolved
      ? { anyOpen: [], mine: [], closed: null, draft: null }
      : await onItsWay(dependency);
    // At submit only the submitter's own counts (089); a release refuses anything unreleased (056).
    const pending = (options.release ? way.anyOpen : way.mine)[0];
    const othersOnly = !pending && way.anyOpen.length > 0;
    // The submitter's own draft (112): it goes with this item, or this item can't go alone.
    if (!item && !pending && way.draft) {
      const where = way.draft.workspace;
      if (where.private && where.id !== input.workspaceId)
        issues.push(
          issue(
            "dependency_not_visible",
            new DependencyNotVisibleError(dependency),
            "/dependencies",
          ),
        );
      else
        issues.push(
          options.together && !options.release
            ? warning(
                "dependency_draft",
                `${dependency} is your draft: it's submitted with this item.`,
              )
            : issue("dependency_draft", new DependencyDraftError(dependency), "/dependencies"),
        );
      continue;
    }
    if (!item && !pending) {
      issues.push(
        way.closed
          ? issue(
              "dependency_closed",
              new DependencyClosedError(dependency, way.closed),
              "/dependencies",
            )
          : othersOnly
            ? issue(
                "dependency_not_published",
                new DependencyNotPublishedError(dependency),
                "/dependencies",
              )
            : issue(
                "dependency_not_found",
                new DependencyNotFoundError(dependency),
                "/dependencies",
              ),
      );
      continue;
    }
    // A private workspace's items are dependencies only of its own (093), at submit and release.
    const where = item?.workspace ?? pending?.workspace;
    if (where?.private && where.id !== input.workspaceId) {
      issues.push(
        issue("dependency_not_visible", new DependencyNotVisibleError(dependency), "/dependencies"),
      );
      continue;
    }
    // Any type may depend on any type (096): no check on the dependency's type.
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
    if (options.release) return null;
    const way = await onItsWay(dependency);
    return way.anyOpen[0]?.dependencies ?? way.draft?.dependencies ?? null;
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
  const cycle = await walk(dependencies, [input.itemName]);
  if (!cycle) return issues;
  // Allowed since 112: said, for the author and the reviewer, since they go together. While any of
  // them is still with its author, review comes next; once all are in review or approved, release.
  const names = [...new Set(cycle)];
  let withAuthor = input.editable === true;
  for (const name of names) {
    if (withAuthor || name === input.itemName) continue;
    const way = await onItsWay(name);
    withAuthor = way.draft !== null || way.anyOpen[0]?.status === "changes_requested";
  }
  return [
    ...issues,
    warning(
      "dependency_cycle",
      `${listed(names)} need each other: they're ${withAuthor ? "submitted for review" : "released"} together.`,
    ),
  ];
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
  /** `together`: the submitter's own drafts go with it (112), as Submit's group takes them. */
  options: { release?: boolean; together?: boolean } = {},
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
          workspace: submission.workspace.name,
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
        authorId: submission.authorId,
        workspaceId: submission.workspace.id,
        editable: isEditable(submission.status),
      },
      options,
    )),
    ...(submission.type === "skill"
      ? await frontmatterAgentIssues(registry, manifest?.skill, files, submission.authorId)
      : []),
  ];
};

/**
 * The agent a skill names in its frontmatter (097) is an agent: published, or the submitter's own
 * on its way (others' unreleased items aren't dependencies, 089, so their type isn't told). Whether
 * it exists and its range are `dependencyIssues`' checks, since it's a dependency too.
 */
export const frontmatterAgentIssues = async (
  registry: RegistryLookup,
  block: unknown,
  files: readonly Omit<DraftFile, "updatedAt">[],
  authorId: string,
): Promise<ManifestIssue[]> => {
  const entry = String(((block ?? {}) as Record<string, unknown>).entry ?? "SKILL.md");
  const file = files.find((f) => f.path === entry);
  if (file?.encoding !== "utf8") return [];
  const agent = parseFrontmatter(file.content).data?.agent;
  const parsed = typeof agent === "string" ? parseItemName(agent) : null;
  if (!parsed) return [];
  const item = await registry.findItem(parsed);
  const own = item
    ? undefined
    : (await registry.submissionsNamed(parsed)).find(
        (s) => s.authorId === authorId && OPEN_STATUSES.includes(s.status),
      );
  const type = item?.type ?? own?.type;
  return type && type !== "agent"
    ? [
        {
          severity: "error",
          code: "frontmatter_agent_type",
          message: `${entry} runs in ${String(agent)}, which is ${/^(agent|output-style|mcp-server|lsp-server)$/.test(type) ? "an" : "a"} ${type}, not an agent.`,
          file: entry,
        },
      ]
    : [];
};
