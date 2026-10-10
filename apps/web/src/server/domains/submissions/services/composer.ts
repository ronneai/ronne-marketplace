import {
  DEPENDENCY_TYPES,
  formatItemName,
  ITEM_TYPES,
  type ItemType,
  isItemType,
  isVersionRange,
  parseItemName,
} from "@ronneai/core";
import type { CurrentUser } from "../../identity/models/user";
import { factsOf } from "../../items/models/catalogue";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import {
  API_PAGE_MAX,
  CATALOGUE_SEARCH_MAX_LENGTH,
  searchCatalogue,
} from "../../items/services/catalogue";
import {
  DEPENDENCY_REPORTS_MAX,
  type DependencyReport,
  PICKER_PAGE_SIZE,
  type PickerEntry,
  type PickerPage,
  type UnreleasedStatus,
} from "../models/composer";
import { itemNameOf } from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { ownDependencies } from "./dependency-search";
import { requireSignedIn } from "./membership";
import { dependencyIssues } from "./registry-checks";

/**
 * What the visual composer (feature 031) reads from the registry. Anyone who may write a draft may
 * ask; it says nothing the catalogue doesn't.
 */
export type ComposerDeps = {
  registry: RegistryLookup;
  catalogue: CatalogueRepository;
  repo: SubmissionRepository;
};
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
  requireSignedIn(actor);
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
    ).map((entry) => [formatItemName(entry), entry]),
  );
  const me = actor.user?.id ?? "";
  // The item's own workspace, from its scope (093): private dependencies elsewhere are refused.
  const scope = parseItemName(String(input.itemName));
  const workspaceId = scope ? ((await deps.repo.findScope(scope))?.workspace.id ?? null) : null;
  const reports: [string, DependencyReport][] = [];
  for (const [name, range] of entries) {
    const entry = listed.get(name);
    // One of the person's own on its way shows its status rather than "not published" (089).
    const own = entry
      ? undefined
      : (
          await deps.repo.listOwnUnreleased({
            authorId: me,
            types: ITEM_TYPES,
            search: name,
            limit: API_PAGE_MAX,
          })
        ).find((submission) => itemNameOf(submission) === name);
    const issues = await dependencyIssues(
      deps.registry,
      {
        itemName: String(input.itemName),
        type: input.type,
        dependencies: { [name]: range },
        authorId: me,
        workspaceId,
        // The canvas edits a draft.
        editable: true,
      },
      // The person's own drafts go with it at Submit (112).
      { together: true },
    );
    reports.push([
      name,
      {
        facts: entry ? factsOf(entry) : null,
        status: own ? (own.status as UnreleasedStatus) : null,
        // Errors stop the submit; warnings don't (112: a draft goes with this item, items need
        // each other). Its status badge says it's on its way, so 056's warning isn't repeated.
        ...(() => {
          const shown = issues
            .filter((issue) => issue.code !== "dependency_range" || isVersionRange(range))
            .filter((issue) => !(own && issue.code === "dependency_pending"));
          return {
            problems: shown.filter((i) => i.severity === "error").map((i) => i.message),
            warnings: shown.filter((i) => i.severity === "warning").map((i) => i.message),
          };
        })(),
      },
    ]);
  }
  return Object.fromEntries(reports);
};

/**
 * The catalogue for the picker (031, 089): the person's own items first on the first page (the
 * ones they published, whatever their rank, then their drafts and open submissions), then 018's
 * search, newest first, of others' published items, page by page. Any type (096), and only
 * published items with a version that can be installed. `only` narrows it to one of those types.
 */
export const searchDependencies = async (
  deps: ComposerDeps,
  actor: ComposerActor,
  input: {
    type: ItemType;
    q?: string;
    only?: ItemType | null;
    cursor?: string;
    /** The item being composed: only what it may depend on is offered (093). */
    itemName?: string;
  },
): Promise<PickerPage> => {
  requireSignedIn(actor);
  const allowed = isItemType(input.type) ? DEPENDENCY_TYPES[input.type] : [];
  const types = input.only ? allowed.filter((type) => type === input.only) : allowed;
  if (types.length === 0 || !actor.user) return { entries: [], nextCursor: null };
  const q = String(input.q ?? "")
    .trim()
    .slice(0, CATALOGUE_SEARCH_MAX_LENGTH);
  const cursor = typeof input.cursor === "string" ? input.cursor : undefined;
  // Worked out on every page, so a later page leaves out what the first one showed as yours.
  // Its own workspace's items and public ones (093); public ones only before its scope exists.
  const scope = input.itemName ? parseItemName(String(input.itemName)) : null;
  const dependableFrom = scope ? ((await deps.repo.findScope(scope))?.workspace.id ?? null) : null;
  const own = await ownDependencies(deps, actor.user.id, {
    types,
    q,
    limit: PICKER_PAGE_SIZE,
    dependableFrom,
  });
  const mine: PickerEntry[] = [
    ...own.published.map(
      (entry): PickerEntry => ({
        name: formatItemName(entry),
        ...factsOf(entry),
        status: "published",
        mine: true,
      }),
    ),
    ...own.unreleased.map(
      (submission): PickerEntry => ({
        name: itemNameOf(submission),
        type: submission.type,
        version: "1.0.0",
        description: "",
        tools: [],
        status: submission.status as UnreleasedStatus,
        mine: true,
      }),
    ),
  ];
  const shown = new Set(mine.map((entry) => entry.name));
  const { entries, nextCursor } = await searchCatalogue({ catalogue: deps.catalogue }, actor, {
    q,
    types,
    installable: true,
    sort: "recent",
    cursor,
    limit: PICKER_PAGE_SIZE,
    dependableFrom,
  });
  const others = entries
    .map(
      (entry): PickerEntry => ({
        name: formatItemName(entry),
        ...factsOf(entry),
        status: "published",
        mine: false,
      }),
    )
    .filter((entry) => !shown.has(entry.name));
  return { entries: cursor ? others : [...mine, ...others], nextCursor };
};
