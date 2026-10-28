import {
  formatItemName,
  formatScopeName,
  nameProblem,
  normalizeScopeName,
  normalizeWorkspaceName,
  parseItemName,
  parseManifest,
} from "@ronneai/core";
import type { AuditAction } from "../../audit/models/audit-event";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can, canInSome } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { renamedFrontmatterAgent, renamedManifest } from "../../submissions/models/manifest-names";
import {
  InvalidScopeMoveTextError,
  ScopeMoveAnsweredError,
  ScopeMoveAskerLostRoleError,
  ScopeMoveConfirmationError,
  ScopeMoveNotFoundError,
  ScopeMoveOpenError,
  ScopeMoveRefusedError,
  ScopeMoveSameWorkspaceError,
  ScopeMoveScopeNotFoundError,
  WorkspaceNotFoundError,
} from "../exceptions/errors";
import { type MoveImpact, SCOPE_MOVE_TEXT_MAX_LENGTH, type ScopeMove } from "../models/scope-move";
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
): Promise<MoveImpact & { way: MoveWay; answeredBy: "root" | "admins" | null }> => {
  const places = await placesOf(deps.repo, actor, input.scopeId, input.to);
  const name = input.name === undefined ? places.scope.name : normalizeScopeName(input.name);
  const impact = await checkMove(deps.repo, actor, places, name);
  // How it would happen, for the dialog's button: at once, at once after typing the name, or a
  // request, and who answers it.
  const way = moveWay(actor.user as CurrentUser, places.target, impact.notReviewed.length > 0);
  const answeredBy =
    way !== "request"
      ? null
      : places.target.isGlobal || places.target.ownerId !== null
        ? ("root" as const)
        : ("admins" as const);
  return { ...impact, way, answeredBy };
};

/** A workspace the Move dialog offers (115): the asker's own personal one marked so. */
export type MoveTarget = {
  name: string;
  visibility: Workspace["visibility"];
  global: boolean;
  personal: boolean;
};

/**
 * Where the scope could go (115): the workspaces the asker sees but the scope's own and other
 * people's personal ones; their own personal one first, then `global`, then by name.
 */
export const moveTargets = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { scopeId: string },
): Promise<MoveTarget[]> => {
  const user = actor.user;
  if (!canInSome(user, "scopes.move")) throw new ForbiddenError("scopes.move");
  const scope = await deps.repo.scopeById(input.scopeId);
  if (!scope || !can(user, "scopes.move", scope.workspaceId))
    throw new ScopeMoveScopeNotFoundError();
  const all = await deps.repo.list();
  const viewer = visibleWorkspaces(user, all);
  const offered = all
    .filter(
      (w) =>
        w.id !== scope.workspaceId &&
        seesWorkspace(viewer, w.id) &&
        (w.ownerId === null || w.ownerId === user?.id),
    )
    .map((w) => ({
      name: w.name,
      visibility: w.visibility,
      global: w.isGlobal,
      personal: w.ownerId !== null,
    }));
  // `list` gives `global` first, then by name: the personal one goes before it.
  return [...offered.filter((w) => w.personal), ...offered.filter((w) => !w.personal)];
};

/**
 * Each scope's latest move in a workspace (115), for its page's rows: open ("Moving to acme ·
 * Cancel") or declined (with the reason, until the next request). For root and the workspace's
 * admins.
 */
export const scopeMovesIn = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId: string },
): Promise<Record<string, ScopeMove>> => {
  if (!can(actor.user, "scopes.move", input.workspaceId)) return {};
  return Object.fromEntries(
    (await deps.repo.latestMovesIn(input.workspaceId)).map((move) => [move.scopeId, move]),
  );
};

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

/** A message or a reason: trimmed, at most 500 characters, no NUL; empty is none. */
const textFrom = (value: string | undefined, field: "message" | "reason"): string | null => {
  const text = value?.trim() ?? "";
  if ([...text].length > SCOPE_MOVE_TEXT_MAX_LENGTH || text.includes("\u0000"))
    throw new InvalidScopeMoveTextError(field);
  return text || null;
};

/**
 * How a move happens (115, decision 1): `twice` at once after two confirmations (root, and an admin
 * of `global` moving to `global`), `once` at once after one (an admin of the target, or into the
 * asker's own personal workspace), or `request` for someone to answer. Not-reviewed versions (114)
 * always make it a request, answered by someone else (decision 4).
 */
export type MoveWay = "once" | "twice" | "request";

export const moveWay = (
  user: Pick<CurrentUser, "id" | "role" | "workspaces">,
  target: Workspace,
  notReviewed: boolean,
): MoveWay => {
  if (notReviewed) return "request";
  if (user.role === "root") return "twice";
  if (target.isGlobal) return can(user, "scopes.move", target.id) ? "twice" : "request";
  if (target.ownerId === user.id) return "once";
  return can(user, "scopes.move", target.id) ? "once" : "request";
};

/**
 * Who answers a request: root, or (for a shared workspace other than `global`) its admins; with
 * not-reviewed versions, never the asker.
 */
const mayAnswer = (
  user: CurrentUser | null,
  move: ScopeMove,
  target: Workspace,
  notReviewed: boolean,
): boolean =>
  user !== null &&
  (user.role === "root" ||
    (!target.isGlobal && target.ownerId === null && can(user, "scopes.move", target.id))) &&
  (!notReviewed || user.id !== move.requestedBy);

/**
 * `mayAnswer`, with the answerer's standing read again from the database under the users' lock the
 * caller holds: demoted, no longer root, or disabled since their session was read, they answer
 * nothing.
 */
const answersNow = async (
  repo: WorkspaceRepository,
  user: CurrentUser | null,
  move: ScopeMove,
  target: Workspace,
  notReviewed: boolean,
) => {
  if (!user || !mayAnswer(user, move, target, notReviewed)) return false;
  const now = await repo.standing(user.id, target.id);
  return now !== null && (now.root || (!target.isGlobal && target.ownerId === null && now.admin));
};

const auditMove = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  action: Extract<AuditAction, `scope.${string}`>,
  scopeId: string,
  metadata: Record<string, string | number | boolean>,
  at: Date,
) =>
  repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action,
      target: { type: "scope", id: scopeId },
      metadata,
      ipAddress: actor.ip,
    },
    at,
  );

/** The scope's full names before and after, and both workspaces, for every move event. */
const moveNames = (
  scope: { name: string },
  source: Workspace,
  target: Workspace,
  name: string,
) => ({
  scope: formatScopeName({ workspace: source.name, scope: scope.name }),
  newName: formatScopeName({ workspace: target.name, scope: name }),
  from: source.name,
  to: target.name,
});

/**
 * The move itself, under the locks the caller holds (115): its items' names now become their old
 * names (118), the names they take stop being old names of theirs (a move back), the open work in
 * the scope names its items by the new names (as a rename does, 113), the scope goes to the
 * target under its name there, its not-reviewed versions become reviewed by whoever approved, and
 * the catalogue revision rises.
 */
const performMove = async (
  repo: WorkspaceRepository,
  places: { scope: { id: string; name: string }; source: Workspace; target: Workspace },
  name: string,
  reviewedBy: string | null,
  at: Date,
) => {
  const { scope, source, target } = places;
  const items = await repo.itemsInScope(scope.id);
  const ids = new Set(items.map((item) => item.id));
  const before = (item: { name: string }) =>
    formatItemName({ workspace: source.name, scope: scope.name, name: item.name });
  const after = (item: { name: string }) =>
    formatItemName({ workspace: target.name, scope: name, name: item.name });
  const ownOld = (await repo.aliasesNamed(items.map(after))).filter((a) => ids.has(a.itemId));

  // Drafts and submissions not released yet name the scope's items by their old names: their own
  // `name`, their dependencies, a skill's agent. Written under the new ones, they submit and
  // release as before.
  const renamed = (value: string) => {
    const parts = parseItemName(value);
    return parts && parts.workspace === source.name && parts.scope === scope.name
      ? formatItemName({ workspace: target.name, scope: name, name: parts.name })
      : null;
  };
  const manifests = (await repo.openManifestsIn(source.id)).filter((f) => f.scope === scope.name);
  const entries = await repo.openFiles(
    manifests.flatMap((file) => {
      const manifest = parseManifest(file.content).manifest;
      if (manifest?.type !== "skill") return [];
      const skill = (manifest.skill ?? {}) as Record<string, unknown>;
      const { content: _, ...where } = file;
      return [{ ...where, path: String(skill.entry ?? "SKILL.md") }];
    }),
  );
  const changed = [
    ...manifests.map((file) => ({ ...file, after: renamedManifest(file.content, renamed) })),
    ...entries.map((file) => ({ ...file, after: renamedFrontmatterAgent(file.content, renamed) })),
  ].flatMap(({ after: text, ...file }) =>
    text === file.content ? [] : [{ ...file, content: text }],
  );
  await repo.writeFiles(changed, at);

  await repo.setAliases(
    items.map((item) => ({ name: before(item), itemId: item.id })),
    ownOld.map((alias) => alias.name),
    "move",
    at,
  );
  await repo.applyMove(scope.id, target.id, name);
  const reviewed = reviewedBy ? await repo.markReviewed(scope.id, reviewedBy) : 0;
  const renames = items.map((item) => ({
    itemId: item.id,
    oldName: before(item),
    newName: after(item),
  }));
  return { done: { items: items.length, reviewed }, renames };
};

/** Locks the scope and both workspaces, then reads them again: what the checks and the move use. */
const lockPlaces = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  scopeId: string,
  to: string,
) => {
  const found = await placesOf(repo, actor, scopeId, to);
  await repo.lockScopeForMove(scopeId);
  for (const id of [found.source.id, found.target.id].sort()) await repo.lockWorkspace(id);
  const places = await placesOf(repo, actor, scopeId, to);
  // Moved meanwhile (another move's approval): its new workspace is locked too.
  if (places.source.id !== found.source.id) await repo.lockWorkspace(places.source.id);
  return places;
};

export type MoveOutcome =
  | { outcome: "moved"; moveId: string; impact: MoveImpact }
  | { outcome: "requested"; moveId: string; impact: MoveImpact };

/**
 * Moves a scope to another workspace, or asks to (115): checked when asked, refused with the list
 * when something would break; at once when the asker may (`moveWay`), confirmed with the scope's
 * name when two confirmations are needed (`confirm`), otherwise an open request for the target's
 * admins or root, with an optional message. One open move per scope.
 */
export const askScopeMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { scopeId: string; to: string; name?: string; message?: string; confirm?: string },
): Promise<MoveOutcome> => {
  const message = textFrom(input.message, "message");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const places = await lockPlaces(repo, actor, input.scopeId, input.to);
    const { scope, source, target } = places;
    const user = actor.user as CurrentUser;
    const open = await repo.openMoveOf(scope.id);
    if (open) throw new ScopeMoveOpenError(open.toWorkspace);
    const name = input.name === undefined ? scope.name : normalizeScopeName(input.name);
    const impact = await checkMove(repo, actor, places, name);
    if (impact.refused) throw new ScopeMoveRefusedError(impact);
    const way = moveWay(user, target, impact.notReviewed.length > 0);
    const names = moveNames(scope, source, target, name);
    if (way === "request") {
      const moveId = await repo.insertMove({
        scopeId: scope.id,
        fromWorkspaceId: source.id,
        toWorkspaceId: target.id,
        requestedBy: user.id,
        newName: name,
        message,
        status: "open",
        decidedBy: null,
        at,
      });
      await auditMove(
        repo,
        actor,
        "scope.move_requested",
        scope.id,
        { ...names, items: impact.items.length },
        at,
      );
      return { outcome: "requested", moveId, impact };
    }
    // Root's, and a `global` admin's into `global` (decision 2): the second confirmation types the
    // scope's name.
    if (way === "twice" && input.confirm?.trim() !== scope.name)
      throw new ScopeMoveConfirmationError(scope.name);
    const { done, renames } = await performMove(repo, places, name, null, at);
    const moveId = await repo.insertMove({
      scopeId: scope.id,
      fromWorkspaceId: source.id,
      toWorkspaceId: target.id,
      requestedBy: user.id,
      newName: name,
      message: null,
      status: "approved",
      decidedBy: user.id,
      at,
    });
    // The items' history (134), behind the move's row: moved by the asker, nobody had to answer.
    await repo.addNameHistory(
      renames,
      "move_scope",
      { requestedBy: user.id, decidedBy: user.id, sourceId: moveId },
      at,
    );
    await auditMove(
      repo,
      actor,
      "scope.moved",
      scope.id,
      { ...names, askedBy: user.id, approvedBy: user.id, direct: true, ...done },
      at,
    );
    return { outcome: "moved", moveId, impact };
  });
};

/** A move request, locked and read open, with its scope and both workspaces as they are now. */
const answering = async <T>(
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  moveId: string,
  work: (
    repo: WorkspaceRepository,
    move: ScopeMove,
    places: { scope: { id: string; name: string }; source: Workspace; target: Workspace },
  ) => Promise<T>,
): Promise<T> => {
  if (!actor.user) throw new ForbiddenError("scopes.move");
  const found = await deps.repo.findMove(moveId);
  if (!found) throw new ScopeMoveNotFoundError();
  return deps.repo.transaction(async (repo) => {
    // The asker's row and the answerer's (a membership change takes them), then the request.
    await repo.lockUsers([found.requestedBy, actor.user?.id ?? ""].filter(Boolean));
    await repo.lockMove(found.id);
    const move = await repo.findMove(found.id);
    if (!move) throw new ScopeMoveNotFoundError();
    const scope = await repo.scopeById(move.scopeId);
    const source = scope ? await repo.findById(scope.workspaceId) : null;
    const target = await repo.findById(move.toWorkspaceId);
    if (!scope || !source || !target) throw new ScopeMoveNotFoundError();
    return work(repo, move, { scope, source, target });
  });
};

/** Approves a move: checked again, and moved (115), or what refuses it now, leaving it open. */
export const approveScopeMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string },
): Promise<{ outcome: "moved"; impact: MoveImpact } | { outcome: "cancelled" }> => {
  const at = now(deps);
  const result = await answering(deps, actor, input.moveId, async (repo, move, found) => {
    const user = actor.user as CurrentUser;
    const notReviewed = (await repo.notReviewedIn(found.scope.id)).length > 0;
    if (!(await answersNow(repo, user, move, found.target, notReviewed)))
      throw new ScopeMoveNotFoundError();
    if (move.status !== "open") throw new ScopeMoveAnsweredError();
    // The asker must still be root or an admin of the scope's workspace (its owner, for a personal
    // one): otherwise the request closes, and nothing moves.
    if (!(await repo.canStillMove(move.requestedBy, found.source.id))) {
      await repo.decideMove(move.id, {
        status: "cancelled",
        decidedBy: null,
        reason: "asker_lost_role",
        at,
      });
      await auditMove(
        repo,
        actor,
        "scope.move_cancelled",
        found.scope.id,
        {
          ...moveNames(found.scope, found.source, found.target, move.newName),
          reason: "asker_lost_role",
        },
        at,
      );
      return { outcome: "cancelled" as const };
    }
    await repo.lockScopeForMove(found.scope.id);
    for (const id of [found.source.id, found.target.id].sort()) await repo.lockWorkspace(id);
    const scope = await repo.scopeById(found.scope.id);
    const source = scope ? await repo.findById(scope.workspaceId) : null;
    const target = await repo.findById(move.toWorkspaceId);
    if (!scope || !source || !target) throw new ScopeMoveNotFoundError();
    const places = { scope, source, target };
    const impact = await checkMove(repo, actor, places, move.newName);
    // Not reviewed since it was checked above, or answered by its asker: someone else answers.
    if (!mayAnswer(user, move, target, impact.notReviewed.length > 0))
      throw new ScopeMoveNotFoundError();
    if (impact.refused) throw new ScopeMoveRefusedError(impact);
    const { done, renames } = await performMove(
      repo,
      places,
      move.newName,
      impact.notReviewed.length > 0 ? user.id : null,
      at,
    );
    if (
      !(await repo.decideMove(move.id, {
        status: "approved",
        decidedBy: user.id,
        reason: null,
        at,
      }))
    )
      throw new ScopeMoveAnsweredError();
    await repo.addNameHistory(
      renames,
      "move_scope",
      { requestedBy: move.requestedBy, decidedBy: user.id, sourceId: move.id },
      at,
    );
    await auditMove(
      repo,
      actor,
      "scope.moved",
      scope.id,
      {
        ...moveNames(scope, source, target, move.newName),
        askedBy: move.requestedBy,
        approvedBy: user.id,
        direct: false,
        ...done,
      },
      at,
    );
    return { outcome: "moved" as const, impact };
  });
  // Committed: the asker lost their role, and the request is closed.
  if (result.outcome === "cancelled") throw new ScopeMoveAskerLostRoleError();
  return result;
};

/** Declines a move, with an optional reason the asker sees on the scope's row (115). */
export const declineScopeMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string; reason?: string },
): Promise<void> => {
  const reason = textFrom(input.reason, "reason");
  const at = now(deps);
  await answering(deps, actor, input.moveId, async (repo, move, places) => {
    if (!(await answersNow(repo, actor.user, move, places.target, false)))
      throw new ScopeMoveNotFoundError();
    if (move.status !== "open") throw new ScopeMoveAnsweredError();
    if (
      !(await repo.decideMove(move.id, {
        status: "declined",
        decidedBy: actor.user?.id ?? null,
        reason,
        at,
      }))
    )
      throw new ScopeMoveAnsweredError();
    await auditMove(
      repo,
      actor,
      "scope.move_declined",
      places.scope.id,
      moveNames(places.scope, places.source, places.target, move.newName),
      at,
    );
  });
};

/** Cancels a move: its asker, root, or an admin of the scope's workspace (115). */
export const cancelScopeMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string },
): Promise<void> => {
  const at = now(deps);
  await answering(deps, actor, input.moveId, async (repo, move, places) => {
    const user = actor.user;
    if (!user || !(user.id === move.requestedBy || can(user, "scopes.move", places.source.id)))
      throw new ScopeMoveNotFoundError();
    if (move.status !== "open") throw new ScopeMoveAnsweredError();
    if (
      !(await repo.decideMove(move.id, {
        status: "cancelled",
        decidedBy: user.id,
        reason: null,
        at,
      }))
    )
      throw new ScopeMoveAnsweredError();
    await auditMove(
      repo,
      actor,
      "scope.move_cancelled",
      places.scope.id,
      moveNames(places.scope, places.source, places.target, move.newName),
      at,
    );
  });
};

/**
 * The workspaces whose moves the user answers (115): every one for root; for anyone else, the
 * shared ones they administer, never `global` or a personal workspace (root's alone).
 */
const answeredIn = (user: CurrentUser, all: readonly Workspace[]): "all" | string[] =>
  user.role === "root"
    ? "all"
    : all
        .filter((w) => !w.isGlobal && w.ownerId === null && can(user, "scopes.move", w.id))
        .map((w) => w.id);

/** How many open moves the Scope moves table reads at most. */
export const PENDING_MOVES_SHOWN = 100;

/** A move request as the Scope moves table shows it (115), with what refuses it now. */
export type MoveRequestRow = {
  id: string;
  /** The scope's full name now, and its full name once moved. */
  scope: string;
  newName: string;
  /** Renamed for a clash in the target. */
  renamed: boolean;
  from: string;
  to: string;
  items: number;
  askedBy: { email: string; name: string };
  createdAt: Date;
  message: string | null;
  notReviewed: string[];
  /** What the checks say now, from the answerer's view: `refused` and the lists. */
  impact: MoveImpact;
};

/**
 * The open moves the actor answers (115), oldest first, each checked again from their view: root
 * every one; a shared workspace's admins the moves into theirs (`global`'s and personal
 * workspaces' are root's alone); a move with not-reviewed versions never by its asker. With
 * `workspaceId`, only the moves into that workspace (its Requests tab).
 */
export const movesToAnswer = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId?: string } = {},
): Promise<{ moves: MoveRequestRow[]; total: number }> => {
  const user = actor.user;
  if (!user) return { moves: [], total: 0 };
  const all = await deps.repo.list();
  const byId = new Map(all.map((w) => [w.id, w]));
  const answered = answeredIn(user, all);
  const where =
    input.workspaceId === undefined
      ? answered
      : answered === "all" || answered.includes(input.workspaceId)
        ? [input.workspaceId]
        : [];
  const pending = await deps.repo.pendingMoves(where, PENDING_MOVES_SHOWN);
  const rows: MoveRequestRow[] = [];
  for (const move of pending) {
    const scope = await deps.repo.scopeById(move.scopeId);
    const source = scope ? byId.get(scope.workspaceId) : undefined;
    const target = byId.get(move.toWorkspaceId);
    if (!scope || !source || !target) continue;
    const impact = await checkMove(deps.repo, actor, { scope, source, target }, move.newName);
    if (!mayAnswer(user, move, target, impact.notReviewed.length > 0)) continue;
    const names = moveNames(scope, source, target, move.newName);
    rows.push({
      id: move.id,
      scope: names.scope,
      newName: names.newName,
      renamed: move.newName !== scope.name,
      from: source.name,
      to: target.name,
      items: impact.items.length,
      askedBy: move.requester,
      createdAt: move.createdAt,
      message: move.message,
      notReviewed: impact.notReviewed,
      impact,
    });
  }
  return { moves: rows, total: rows.length };
};

/** The nav's count of moves the actor answers (115): with the requests to join, next to Requests. */
export const countMovesToAnswer = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<number> => {
  // On every page: who may answer needs only the not-reviewed versions, not the whole check.
  const user = actor.user;
  if (!user) return 0;
  const all = await deps.repo.list();
  const byId = new Map(all.map((w) => [w.id, w]));
  const answered = answeredIn(user, all);
  let count = 0;
  for (const move of await deps.repo.pendingMoves(answered, PENDING_MOVES_SHOWN)) {
    const target = byId.get(move.toWorkspaceId);
    const notReviewed = (await deps.repo.notReviewedIn(move.scopeId)).length > 0;
    if (target && mayAnswer(user, move, target, notReviewed)) count++;
  }
  return count;
};
