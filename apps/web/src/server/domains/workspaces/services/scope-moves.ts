import {
  formatItemName,
  nameProblem,
  normalizeScopeName,
  normalizeWorkspaceName,
  parseManifest,
} from "@ronneai/core";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can, canInSome } from "../../identity/models/permissions";
import {
  ScopeMoveSameWorkspaceError,
  ScopeMoveScopeNotFoundError,
  WorkspaceNotFoundError,
} from "../exceptions/errors";
import type { MoveImpact } from "../models/scope-move";
import { seesWorkspace, visibleWorkspaces } from "../models/viewer";
import type { Workspace } from "../models/workspace";
import type { WorkspaceRepository } from "../repositories/workspace-repository";
import type { WorkspaceActor, WorkspaceDeps } from "./workspaces";

/** Its dependencies' names, from a ronne.yaml, or none when it doesn't parse. */
const dependenciesOf = (manifest: string | null): string[] =>
  manifest
    ? Object.keys((parseManifest(manifest).manifest?.dependencies ?? {}) as Record<string, string>)
    : [];

/**
 * The scope and the workspace it would move to (115), as the asker may name them: root, or an
 * admin of the scope's workspace (its owner, for a personal one, 114). A scope they can't move and
 * a workspace they don't see answer as not found; so does someone else's personal workspace,
 * which only its owner moves scopes into, and the scope's own workspace is refused.
 */
const placesOf = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  scopeId: string,
  to: string,
) => {
  const user = actor.user;
  if (!canInSome(user, "scopes.move")) throw new ForbiddenError("scopes.move");
  const scope = await repo.scopeById(scopeId);
  if (!scope || !can(user, "scopes.move", scope.workspaceId))
    throw new ScopeMoveScopeNotFoundError();
  const source = await repo.findById(scope.workspaceId);
  if (!source) throw new ScopeMoveScopeNotFoundError();
  // Only a valid name is looked up, and only that name: a NUL fails on PostgreSQL, and MySQL's
  // collation would match an accented or full-width spelling.
  const wanted = normalizeWorkspaceName(to);
  // A reserved name is still one: `global`'s.
  const problem = nameProblem(wanted, "workspace");
  const target = problem && problem !== "reserved" ? null : await repo.findByName(wanted);
  const viewer = visibleWorkspaces(user, await repo.list());
  if (
    !target ||
    target.name !== wanted ||
    !seesWorkspace(viewer, target.id) ||
    (target.ownerId !== null && target.ownerId !== user?.id)
  )
    throw new WorkspaceNotFoundError();
  if (target.id === source.id) throw new ScopeMoveSameWorkspaceError(source.name);
  return { scope, source, target };
};

/** The checks themselves, for places already found: the dialog, and later asking and moving. */
export const checkMove = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  places: {
    scope: { id: string; name: string };
    source: Workspace;
    target: Workspace;
  },
  name: string,
): Promise<MoveImpact> => {
  const { scope, source, target } = places;
  const user = actor.user;
  const problem = nameProblem(name, "scope");
  const clash = problem === null && (await repo.scopeNamed(target.id, name));
  const items = await repo.itemsInScope(scope.id);
  const ids = new Set(items.map((item) => item.id));
  const renamed = items.map((item) => ({
    from: formatItemName({ workspace: source.name, scope: scope.name, name: item.name }),
    to: formatItemName({ workspace: target.name, scope: name, name: item.name }),
  }));

  // What the asker sees (093): they're told about anything else only as a count, so a check can't
  // name, or confirm, an item in someone's personal workspace (114) or a private one they aren't in.
  const viewer = visibleWorkspaces(user, await repo.list());
  const sees = (workspaceId: string) => seesWorkspace(viewer, workspaceId);

  // A new name that's another item's old name stays that item's (118); the scope's own items' old
  // names don't count, so a scope moves back where it came from.
  const others =
    problem === null
      ? (await repo.aliasesNamed(renamed.map((r) => r.to))).filter((a) => !ids.has(a.itemId))
      : [];
  const where = await repo.itemWorkspaces(others.map((a) => a.itemId));
  const aliasTaken = others
    .filter((a) => sees(where.get(a.itemId)?.workspaceId ?? ""))
    .map((a) => a.name)
    .sort();

  // With a private target, released items outside it lose sight of the scope's (093).
  const intoPrivate = target.visibility === "private";
  const dependents = intoPrivate ? await repo.outsideDependents(target.id, scope.id) : [];
  const outsideDependents = dependents
    .filter((d) => sees(d.workspaceId))
    .map((d) => d.name)
    .sort();

  // The scope's own released versions and open submissions may depend only on the scope's and the
  // target's items, and on public ones, once moved (093).
  const work = await repo.scopeOpenWork(scope.id);
  const waiting = work.filter((w) =>
    ["submitted", "changes_requested", "approved"].includes(w.status),
  );
  const wanted = waiting.flatMap((w) => dependenciesOf(w.manifest));
  const resolved = await repo.resolveItems(wanted);
  // Not released yet (056, 112): a dependency in review is judged by where it is, as its release
  // will be.
  const inReview = await repo.resolveOpenSubmissions(wanted.filter((name) => !resolved.has(name)));
  const blocked = (dependency: { scopeId?: string; workspaceId: string; visibility: string }) =>
    dependency.scopeId !== scope.id &&
    dependency.visibility === "private" &&
    dependency.workspaceId !== target.id;
  const own: { item: string; dependency: string; seen: boolean }[] = [
    ...(await repo.scopeReleasedDependencies(scope.id))
      .filter((d) => blocked(d))
      .map(({ item, dependency, workspaceId }) => ({ item, dependency, seen: sees(workspaceId) })),
    ...waiting.flatMap((w) =>
      dependenciesOf(w.manifest).flatMap((name) => {
        const found = resolved.get(name) ?? inReview.get(name);
        if (found)
          return blocked(found)
            ? [{ item: w.name, dependency: name, seen: sees(found.workspaceId) }]
            : [];
        // A name that's neither released nor in review refuses too, for anyone but root: otherwise
        // a refusal would tell a hidden item from a name nobody has.
        return user?.role === "root" ? [] : [{ item: w.name, dependency: name, seen: false }];
      }),
    ),
  ];
  const ownDependencies = own
    .filter((d) => d.seen)
    .map(({ item, dependency }) => ({ item, dependency }))
    .sort((a, b) => a.item.localeCompare(b.item) || a.dependency.localeCompare(b.dependency));

  // Open submissions outside that depend on the scope's items fail at release once it's private:
  // a warning, as for turning a workspace private.
  let openOutside: { name: string; workspaceId: string }[] = [];
  if (intoPrivate) {
    const outside = await repo.openSubmissionsOutsideScope(scope.id, target.id);
    const names = await repo.resolveItems(outside.flatMap((o) => dependenciesOf(o.manifest)));
    openOutside = outside.filter((o) =>
      dependenciesOf(o.manifest).some((name) => names.get(name)?.scopeId === scope.id),
    );
  }
  const openDependents = openOutside
    .filter((o) => sees(o.workspaceId))
    .map((o) => o.name)
    .sort();

  // Their authors read and withdraw work they can no longer change (091) unless they're in the
  // target; root works everywhere. Someone else's draft is theirs alone: counted, not named, for
  // anyone but root.
  const authors = [...new Set(work.filter((w) => !w.authorRoot).map((w) => w.authorId))];
  const members = await repo.membersAmong(target.id, authors);
  const stranded = work.filter((w) => !w.authorRoot && !members.has(w.authorId));
  const shown = (w: (typeof work)[number]) =>
    user?.role === "root" || w.status !== "draft" || w.authorId === user?.id;
  const notMembers = stranded
    .filter(shown)
    .map((w) => ({ item: w.name, author: w.authorEmail ?? "a former user" }));

  const notReviewed = await repo.notReviewedIn(scope.id);
  // Into a private workspace from a shared one, its other readers lose sight. Out of a personal one
  // (114), only its owner (and root) saw it: they lose sight unless the target is theirs or
  // they're in it.
  const owner = source.ownerId;
  const fewerSee =
    target.visibility === "private" &&
    (owner === null ||
      (target.ownerId !== owner && !(await repo.membersAmong(target.id, [owner])).has(owner)));

  return {
    scope: { id: scope.id, name: scope.name, workspace: source.name },
    target: {
      id: target.id,
      name: target.name,
      visibility: target.visibility,
      global: target.isGlobal,
      personal: target.ownerId !== null && target.ownerId === user?.id,
    },
    name,
    nameProblem: problem,
    clash,
    items: renamed,
    aliasTaken,
    aliasHidden: others.length - aliasTaken.length,
    outsideDependents,
    outsideHidden: dependents.length - outsideDependents.length,
    ownDependencies,
    ownHidden: own.length - ownDependencies.length,
    openDependents,
    openHidden: openOutside.length - openDependents.length,
    notMembers,
    notMembersHidden: stranded.length - notMembers.length,
    notReviewed,
    fewerSee,
    refused:
      problem !== null || clash || others.length > 0 || dependents.length > 0 || own.length > 0,
  };
};

/**
 * What moving a scope to `to` would change, and what refuses it (115), for the Move dialog: the
 * scope's name there is `name` (its current one by default). Asked by root or an admin of the
 * scope's workspace.
 */
export const moveImpact = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { scopeId: string; to: string; name?: string },
): Promise<MoveImpact> => {
  const places = await placesOf(deps.repo, actor, input.scopeId, input.to);
  const name = input.name === undefined ? places.scope.name : normalizeScopeName(input.name);
  return checkMove(deps.repo, actor, places, name);
};
