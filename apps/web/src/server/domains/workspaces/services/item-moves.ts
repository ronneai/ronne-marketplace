import { formatItemName, formatScopeName, parseItemName, parseManifest } from "@ronneai/core";
import type { AuditAction } from "../../audit/models/audit-event";
import { can, workspacesWith } from "../../identity/models/permissions";
import { renamedFrontmatterAgent, renamedManifest } from "../../submissions/models/manifest-names";
import {
  InvalidItemMoveTextError,
  ItemMoveAnsweredError,
  ItemMoveAskerLostRoleError,
  ItemMoveItemNotFoundError,
  ItemMoveNotFoundError,
  ItemMoveOpenError,
  ItemMoveRefusedError,
  ItemMoveSameScopeError,
  ItemMoveScopeNotFoundError,
  ItemMoveTargetMovedError,
} from "../exceptions/errors";
import {
  ITEM_MOVE_TEXT_MAX_LENGTH,
  type ItemMove,
  type ItemMoveClash,
  type ItemMoveImpact,
} from "../models/item-move";
import { seesWorkspace, visibleWorkspaces } from "../models/viewer";
import type { Workspace } from "../models/workspace";
import type {
  ItemForMove,
  NameHistoryRow,
  WorkspaceRepository,
} from "../repositories/workspace-repository";
import type { WorkspaceActor, WorkspaceDeps } from "./workspaces";

/** What a move reads: the item, its workspace, and the scope it would go to. */
export type ItemMovePlaces = {
  item: ItemForMove;
  workspace: Workspace;
  target: { id: string; name: string };
};

/**
 * The item and the scope it would move to (134), as the asker may name them: root, or any member
 * of the item's workspace. An item they can't ask about answers as not found, never told from one
 * that isn't there; the target must be another scope of the same workspace.
 */
export const itemMovePlaces = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  input: { itemId: string; toScopeId: string },
): Promise<ItemMovePlaces> => {
  const user = actor.user;
  const item = await repo.itemForMove(input.itemId);
  if (!item || !can(user, "items.move_ask", item.workspaceId))
    throw new ItemMoveItemNotFoundError();
  const workspace = await repo.findById(item.workspaceId);
  if (!workspace) throw new ItemMoveItemNotFoundError();
  const target = await repo.scopeById(input.toScopeId);
  if (!target || target.workspaceId !== item.workspaceId) throw new ItemMoveScopeNotFoundError();
  if (target.id === item.scopeId) throw new ItemMoveSameScopeError(item.scopeName);
  return { item, workspace, target: { id: target.id, name: target.name } };
};

/**
 * What the move would change, and what refuses it (134). Within one workspace nobody gains or
 * loses sight of the item, so only its new name can refuse it: taken by an item of the target
 * scope or by an open submission of a new one, or another item's old name (118; the item's own old
 * names don't count, so it moves back where it came from). Its own open work, and the workspace's
 * open work that depends on it, take the new name; other people's drafts are counted, never named,
 * for anyone but root, who sees them.
 */
export const checkItemMove = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  places: ItemMovePlaces,
): Promise<ItemMoveImpact> => {
  const { item, workspace, target } = places;
  const user = actor.user;
  const fullName = formatItemName({
    workspace: workspace.name,
    scope: item.scopeName,
    name: item.name,
  });
  const newName = formatItemName({
    workspace: workspace.name,
    scope: target.name,
    name: item.name,
  });

  const clash: ItemMoveClash | null = (await repo.itemNamedIn(target.id, item.name))
    ? "item"
    : (await repo.newItemSubmittedIn(target.id, item.name))
      ? "submission"
      : (await repo.aliasesNamed([newName])).some((alias) => alias.itemId !== item.id)
        ? "alias"
        : null;

  // The workspace's open work that names the item: a ronne.yaml the rewrite would change.
  const renamed = (value: string) => {
    const parts = parseItemName(value);
    return parts && formatItemName(parts) === fullName ? newName : null;
  };
  const naming = new Map<string, { scope: string; name: string }>();
  for (const file of await repo.openManifestsIn(workspace.id))
    if (renamedManifest(file.content, renamed) !== file.content)
      naming.set(file.submissionId, { scope: file.scope, name: file.name });
  const about = await repo.submissionsAbout([...naming.keys()]);
  const root = user?.role === "root";
  let proposals = 0;
  let dependentsHidden = 0;
  const dependents = new Set<string>();
  for (const [id, where] of naming) {
    const submission = about.get(id);
    if (!submission) continue;
    if (submission.itemId === item.id) proposals += 1;
    else if (submission.status === "draft" && submission.authorId !== user?.id && !root)
      dependentsHidden += 1;
    else dependents.add(formatItemName({ workspace: workspace.name, ...where }));
  }

  return {
    item: {
      id: item.id,
      name: item.name,
      fullName,
      scopeId: item.scopeId,
      workspaceId: workspace.id,
    },
    target,
    newName,
    clash,
    proposals,
    dependents: [...dependents].sort(),
    dependentsHidden,
    way: can(user, "items.move", workspace.id) ? "now" : "request",
    refused: clash !== null,
  };
};

/** The dialog's checks (134): the places as the asker may name them, then what the move does. */
export const itemMoveImpact = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  input: { itemId: string; toScopeId: string },
): Promise<ItemMoveImpact> => checkItemMove(repo, actor, await itemMovePlaces(repo, actor, input));

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

const textFrom = (value: string | undefined, field: "message" | "reason"): string | null => {
  const text = value?.trim() ?? "";
  if ([...text].length > ITEM_MOVE_TEXT_MAX_LENGTH || text.includes("\u0000"))
    throw new InvalidItemMoveTextError(field);
  return text || null;
};

/** The item's target scope, written in full (`@acme/devops`, `@devops` in `global`). */
const scopeFullName = (workspace: Workspace, scope: string) =>
  formatScopeName({ workspace: workspace.name, scope });

const auditItemMove = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  action: Extract<AuditAction, `item.${string}`>,
  itemId: string,
  metadata: Record<string, string | number | boolean>,
  at: Date,
) =>
  repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action,
      target: { type: "item", id: itemId },
      metadata,
      ipAddress: actor.ip,
    },
    at,
  );

/** What every item move event names: the item now, where it goes, and its name there. */
const moveNames = (impact: ItemMoveImpact, places: ItemMovePlaces) => ({
  name: impact.item.fullName,
  newName: impact.newName,
  from: scopeFullName(places.workspace, places.item.scopeName),
  to: scopeFullName(places.workspace, places.target.name),
});

/**
 * Whether the user moves (or answers) at once, asks, or neither, read from the database under the
 * users' lock the caller holds: a session from before a demotion, a removal or a disabling counts
 * for nothing.
 */
const standingIn = async (repo: WorkspaceRepository, userId: string, workspaceId: string) => {
  const now = await repo.roleIn(userId, workspaceId);
  if (!now) return "none" as const;
  if (now.root || now.role === "admin" || now.role === "moderator") return "moves" as const;
  return now.role === "user" ? ("asks" as const) : ("none" as const);
};

/** Locks what a move changes, in a release's order, and reads the places again. */
const lockItemPlaces = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  input: { itemId: string; toScopeId: string },
) => {
  const found = await itemMovePlaces(repo, actor, input);
  // The workspace's scopes and open submissions (a submit's and a save's locks, as a rename takes
  // them), then the item (a release's, after its submissions), then read again.
  await repo.lockOpenWorkIn(found.workspace.id);
  await repo.lockItemForMove(found.item.id);
  return itemMovePlaces(repo, actor, input);
};

/**
 * The move itself, under the locks the caller holds (134): the item's name now becomes an old name
 * (118), the one it takes stops being one of its own (a move back), the workspace's open work names
 * it by the new name (113's rewrite), the item and its submissions go to the target scope, and the
 * catalogue revision rises.
 */
const performItemMove = async (
  repo: WorkspaceRepository,
  impact: ItemMoveImpact,
  places: ItemMovePlaces,
  at: Date,
) => {
  const { item, workspace } = places;
  const from = impact.item.fullName;
  const to = impact.newName;
  const ownOld = (await repo.aliasesNamed([to])).filter((a) => a.itemId === item.id);
  const renamed = (value: string) => {
    const parts = parseItemName(value);
    return parts && formatItemName(parts) === from ? to : null;
  };
  const manifests = await repo.openManifestsIn(workspace.id);
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
  ].flatMap(({ after, ...file }) => (after === file.content ? [] : [{ ...file, content: after }]));
  await repo.writeFiles(changed, at);
  await repo.setAliases(
    [{ name: from, itemId: item.id }],
    ownOld.map((a) => a.name),
    "move",
    at,
  );
  await repo.applyItemMove(item.id, places.target.id);
};

export type ItemMoveOutcome =
  | { outcome: "moved"; moveId: string; impact: ItemMoveImpact }
  | { outcome: "requested"; moveId: string; impact: ItemMoveImpact };

/**
 * Moves an item to another scope of its workspace, or asks to (134): at once for root and the
 * workspace's moderators and admins, otherwise an open request they answer, with an optional
 * message. Refused while the new name is taken, and while another move is open for the item.
 */
export const askItemMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { itemId: string; toScopeId: string; message?: string },
): Promise<ItemMoveOutcome> => {
  const message = textFrom(input.message, "message");
  const at = now(deps);
  const user = actor.user;
  if (!user) throw new ItemMoveItemNotFoundError();
  return deps.repo.transaction(async (repo) => {
    // The asker's row first (a membership change takes it), so their role is read as it is now.
    await repo.lockUsers([user.id]);
    const places = await lockItemPlaces(repo, actor, input);
    const standing = await standingIn(repo, user.id, places.workspace.id);
    if (standing === "none") throw new ItemMoveItemNotFoundError();
    const open = await repo.openItemMoveOf(places.item.id);
    if (open) {
      const target = await repo.scopeById(open.toScopeId);
      throw new ItemMoveOpenError(scopeFullName(places.workspace, target?.name ?? ""));
    }
    const checked = await checkItemMove(repo, actor, places);
    const impact = { ...checked, way: standing === "moves" ? "now" : "request" } as const;
    if (impact.refused) throw new ItemMoveRefusedError(impact);
    const names = moveNames(impact, places);
    if (impact.way === "request") {
      const moveId = await repo.insertItemMove({
        itemId: places.item.id,
        fromScopeId: places.item.scopeId,
        toScopeId: places.target.id,
        requestedBy: user.id,
        message,
        status: "open",
        decidedBy: null,
        at,
      });
      await auditItemMove(repo, actor, "item.move_requested", places.item.id, names, at);
      // Root and the workspace's moderators and admins answer it: told once (139).
      await repo.notify(
        {
          recipients: await repo.answerersOf(places.workspace.id),
          kind: "request.item_move_waiting",
          actorId: user.id,
          subject: { type: "item_move", id: moveId },
          params: { item: names.name, newName: names.newName, from: names.from, to: names.to },
        },
        at,
      );
      return { outcome: "requested", moveId, impact };
    }
    await performItemMove(repo, impact, places, at);
    const moveId = await repo.insertItemMove({
      itemId: places.item.id,
      fromScopeId: places.item.scopeId,
      toScopeId: places.target.id,
      requestedBy: user.id,
      message: null,
      status: "approved",
      decidedBy: user.id,
      at,
    });
    await repo.addNameHistory(
      [{ itemId: places.item.id, oldName: impact.item.fullName, newName: impact.newName }],
      "move_item",
      { requestedBy: user.id, decidedBy: user.id, sourceId: moveId },
      at,
    );
    await auditItemMove(
      repo,
      actor,
      "item.moved",
      places.item.id,
      { ...names, askedBy: user.id, approvedBy: user.id, direct: true },
      at,
    );
    return { outcome: "moved", moveId, impact };
  });
};

/**
 * A move request, locked and read open, with the item and its scopes as they are now. The users'
 * rows, then the request's, then (for an approval) the release's locks.
 */
const answeringItemMove = async <T>(
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  moveId: string,
  work: (repo: WorkspaceRepository, move: ItemMove) => Promise<T>,
): Promise<T> => {
  const user = actor.user;
  if (!user) throw new ItemMoveNotFoundError();
  const found = await deps.repo.findItemMove(moveId);
  if (!found) throw new ItemMoveNotFoundError();
  return deps.repo.transaction(async (repo) => {
    await repo.lockUsers([found.requestedBy, user.id]);
    await repo.lockItemMove(found.id);
    const move = await repo.findItemMove(found.id);
    if (!move) throw new ItemMoveNotFoundError();
    return work(repo, move);
  });
};

/** The item's workspace, for the checks on who answers; null when the item is gone. */
const workspaceOfMove = async (repo: WorkspaceRepository, move: ItemMove) => {
  const item = await repo.itemForMove(move.itemId);
  return item ? { item, workspace: await repo.findById(item.workspaceId) } : null;
};

/**
 * Approves a request (134): root or the workspace's moderators and admins, never its asker, read
 * again from the database. The asker must still be in the workspace, and the target still in it,
 * or the request closes as cancelled; a clash found now leaves it open.
 */
export const approveItemMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string },
): Promise<{ outcome: "moved"; impact: ItemMoveImpact }> => {
  const at = now(deps);
  const user = actor.user;
  const result = await answeringItemMove(deps, actor, input.moveId, async (repo, move) => {
    const where = await workspaceOfMove(repo, move);
    if (!where?.workspace || !user) throw new ItemMoveNotFoundError();
    const { workspace } = where;
    if (user.id === move.requestedBy || (await standingIn(repo, user.id, workspace.id)) !== "moves")
      throw new ItemMoveNotFoundError();
    if (move.status !== "open") throw new ItemMoveAnsweredError();
    const target = await repo.scopeById(move.toScopeId);
    const close = async (reason: "asker_lost_role" | "target_moved") => {
      await repo.decideItemMove(move.id, { status: "cancelled", decidedBy: null, reason, at });
      await auditItemMove(
        repo,
        actor,
        "item.move_cancelled",
        move.itemId,
        {
          name: formatItemName({
            workspace: workspace.name,
            scope: where.item.scopeName,
            name: where.item.name,
          }),
          to: target ? scopeFullName(workspace, target.name) : "",
          reason,
        },
        at,
      );
      // The target as the answerer can see it: in full where they see its workspace now (093),
      // otherwise in the item's workspace, where it was asked for.
      const targetWorkspace = target ? await repo.findById(target.workspaceId) : null;
      const sees =
        targetWorkspace !== null &&
        seesWorkspace(visibleWorkspaces(user, await repo.list()), targetWorkspace.id);
      const named = target
        ? scopeFullName(sees && targetWorkspace ? targetWorkspace : workspace, target.name)
        : "";
      return { outcome: "cancelled" as const, reason, target: named };
    };
    // The item and its target in one workspace still (its own scope or the target may have moved,
    // 115), then the asker still in it.
    if (!target || target.workspaceId !== workspace.id || target.id === where.item.scopeId)
      return close("target_moved");
    if ((await standingIn(repo, move.requestedBy, workspace.id)) === "none")
      return close("asker_lost_role");
    // The answerer may move it: the places as root sees them, then the release's locks.
    const asRoot = { user: { ...user, role: "root" as const }, ip: actor.ip };
    const places = await lockItemPlaces(repo, asRoot, {
      itemId: move.itemId,
      toScopeId: move.toScopeId,
    });
    const impact = { ...(await checkItemMove(repo, actor, places)), way: "request" as const };
    if (impact.refused) throw new ItemMoveRefusedError(impact);
    await performItemMove(repo, impact, places, at);
    if (
      !(await repo.decideItemMove(move.id, {
        status: "approved",
        decidedBy: user.id,
        reason: null,
        at,
      }))
    )
      throw new ItemMoveAnsweredError();
    await repo.addNameHistory(
      [{ itemId: move.itemId, oldName: impact.item.fullName, newName: impact.newName }],
      "move_item",
      { requestedBy: move.requestedBy, decidedBy: user.id, sourceId: move.id },
      at,
    );
    await auditItemMove(
      repo,
      actor,
      "item.moved",
      move.itemId,
      {
        ...moveNames(impact, places),
        askedBy: move.requestedBy,
        approvedBy: user.id,
        direct: false,
      },
      at,
    );
    const moved = moveNames(impact, places);
    await repo.notify(
      {
        recipients: [move.requestedBy],
        kind: "item_move.moved",
        actorId: user.id,
        subject: { type: "item_move", id: move.id },
        params: { item: moved.name, newName: moved.newName, from: moved.from, to: moved.to },
      },
      at,
    );
    return { outcome: "moved" as const, impact };
  });
  // Committed: the request is closed, and nothing moved.
  if (result.outcome === "cancelled") {
    if (result.reason === "asker_lost_role") throw new ItemMoveAskerLostRoleError();
    throw new ItemMoveTargetMovedError(result.target);
  }
  return result;
};

/** Declines a request, with an optional reason for its asker (134): whoever may approve it. */
export const declineItemMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string; reason?: string },
): Promise<void> => {
  const reason = textFrom(input.reason, "reason");
  const at = now(deps);
  await answeringItemMove(deps, actor, input.moveId, async (repo, move) => {
    const where = await workspaceOfMove(repo, move);
    const user = actor.user;
    if (!where?.workspace || !user) throw new ItemMoveNotFoundError();
    if (
      user.id === move.requestedBy ||
      (await standingIn(repo, user.id, where.workspace.id)) !== "moves"
    )
      throw new ItemMoveNotFoundError();
    if (move.status !== "open") throw new ItemMoveAnsweredError();
    if (
      !(await repo.decideItemMove(move.id, { status: "declined", decidedBy: user.id, reason, at }))
    )
      throw new ItemMoveAnsweredError();
    const target = await repo.scopeById(move.toScopeId);
    await auditItemMove(
      repo,
      actor,
      "item.move_declined",
      move.itemId,
      {
        name: formatItemName({
          workspace: where.workspace.name,
          scope: where.item.scopeName,
          name: where.item.name,
        }),
        to: target ? scopeFullName(where.workspace, target.name) : "",
      },
      at,
    );
    await repo.notify(
      {
        recipients: [move.requestedBy],
        kind: "item_move.declined",
        actorId: user.id,
        subject: { type: "item_move", id: move.id },
        params: {
          item: formatItemName({
            workspace: where.workspace.name,
            scope: where.item.scopeName,
            name: where.item.name,
          }),
          to: target ? scopeFullName(where.workspace, target.name) : "",
        },
      },
      at,
    );
  });
};

/** Cancels a request (134): its asker, or whoever may answer it. */
export const cancelItemMove = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { moveId: string },
): Promise<void> => {
  const at = now(deps);
  await answeringItemMove(deps, actor, input.moveId, async (repo, move) => {
    const where = await workspaceOfMove(repo, move);
    const user = actor.user;
    if (!where?.workspace || !user) throw new ItemMoveNotFoundError();
    if (
      user.id !== move.requestedBy &&
      (await standingIn(repo, user.id, where.workspace.id)) !== "moves"
    )
      throw new ItemMoveNotFoundError();
    if (move.status !== "open") throw new ItemMoveAnsweredError();
    if (
      !(await repo.decideItemMove(move.id, {
        status: "cancelled",
        decidedBy: user.id,
        reason: null,
        at,
      }))
    )
      throw new ItemMoveAnsweredError();
    const target = await repo.scopeById(move.toScopeId);
    await auditItemMove(
      repo,
      actor,
      "item.move_cancelled",
      move.itemId,
      {
        name: formatItemName({
          workspace: where.workspace.name,
          scope: where.item.scopeName,
          name: where.item.name,
        }),
        to: target ? scopeFullName(where.workspace, target.name) : "",
      },
      at,
    );
  });
};

/** What the item page needs for Move to another scope… (134), for someone who may ask. */
export type ItemMoveView = {
  /** The item's workspace, by name: its moderators, admins or root answer a request. */
  workspace: string;
  /** Whether a move by this person happens at once or is a request. */
  way: "now" | "request";
  /** The workspace's other scopes. */
  targets: { id: string; name: string; description: string }[];
  /**
   * The latest request, while it's open (for its asker and whoever may answer it) or declined
   * (for its asker, until the next request); null otherwise.
   */
  latest: {
    id: string;
    status: "open" | "declined";
    /** The target scope, in full. */
    to: string;
    reason: string | null;
    askedByName: string | null;
    /** The person asked it. */
    mine: boolean;
  } | null;
};

/**
 * The item page's Move… (134): null for someone who may not ask (not in the item's workspace, or
 * signed out), else where it could go, how, and the request to show. Read from the database, as
 * asking will be.
 */
export const itemMoveView = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  itemId: string,
): Promise<ItemMoveView | null> => {
  const user = actor.user;
  if (!user) return null;
  const item = await repo.itemForMove(itemId);
  if (!item) return null;
  const standing = await standingIn(repo, user.id, item.workspaceId);
  if (standing === "none") return null;
  const workspace = await repo.findById(item.workspaceId);
  if (!workspace) return null;
  const targets = (await repo.scopesIn(item.workspaceId)).filter((s) => s.id !== item.scopeId);
  const move = await repo.latestItemMoveOf(item.id);
  const mine = move?.requestedBy === user.id;
  const shown =
    move &&
    ((move.status === "open" && (mine || standing === "moves")) ||
      (move.status === "declined" && mine))
      ? {
          id: move.id,
          status: move.status as "open" | "declined",
          to: scopeFullName(workspace, move.toScope),
          reason: move.status === "declined" ? move.reason : null,
          askedByName: move.askedByName,
          mine,
        }
      : null;
  return {
    workspace: workspace.name,
    way: standing === "moves" ? "now" : "request",
    targets,
    latest: shown,
  };
};

/** How many open item moves the Item moves table reads at most. */
export const PENDING_ITEM_MOVES_SHOWN = 100;

/** A request to move an item as the Item moves table shows it (134), with what refuses it now. */
export type ItemMoveRequestRow = {
  id: string;
  /** The item's full name now, its type, and its full name once moved. */
  item: string;
  type: string;
  newName: string;
  /** The scopes, in full. */
  from: string;
  to: string;
  /** The item's workspace. */
  workspace: string;
  askedBy: { email: string; name: string };
  createdAt: Date;
  message: string | null;
  /**
   * What the checks say now: a clash, or `moved` when the item and its target aren't in one
   * workspace any more (approving cancels it); null when it can move.
   */
  refusal: ItemMoveImpact["clash"] | "moved" | null;
};

/** The workspaces where the person answers item moves: all for root, else where they moderate. */
const answersItemMovesIn = (user: NonNullable<WorkspaceActor["user"]>) =>
  workspacesWith(user, "items.move");

/**
 * The item moves waiting for this person's answer (134), oldest first: in every workspace where
 * they moderate or administer (every one for root), or in one; never their own requests. Each row
 * says what would refuse it now, from the checks approving runs.
 */
export const itemMovesToAnswer = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId?: string } = {},
): Promise<{ moves: ItemMoveRequestRow[]; total: number }> => {
  const user = actor.user;
  if (!user) return { moves: [], total: 0 };
  const answered = answersItemMovesIn(user);
  const where =
    input.workspaceId === undefined
      ? answered
      : answered === "all" || answered.includes(input.workspaceId)
        ? [input.workspaceId]
        : [];
  const pending = await deps.repo.pendingItemMoves(where, PENDING_ITEM_MOVES_SHOWN);
  const rows: ItemMoveRequestRow[] = [];
  for (const move of pending) {
    if (move.requestedBy === user.id) continue;
    const item = await deps.repo.itemForMove(move.itemId);
    const workspace = item ? await deps.repo.findById(item.workspaceId) : null;
    const target = await deps.repo.scopeById(move.toScopeId);
    if (!item || !workspace || !target) continue;
    const name = formatItemName({
      workspace: workspace.name,
      scope: item.scopeName,
      name: item.name,
    });
    const sameWorkspace = target.workspaceId === workspace.id && target.id !== item.scopeId;
    const impact = sameWorkspace
      ? await checkItemMove(deps.repo, actor, {
          item,
          workspace,
          target: { id: target.id, name: target.name },
        })
      : null;
    rows.push({
      id: move.id,
      item: name,
      type: item.type,
      newName:
        impact?.newName ??
        formatItemName({ workspace: workspace.name, scope: target.name, name: item.name }),
      from: scopeFullName(workspace, item.scopeName),
      to: scopeFullName(workspace, target.name),
      workspace: workspace.name,
      askedBy: move.requester,
      createdAt: move.createdAt,
      message: move.message,
      refusal: impact ? impact.clash : "moved",
    });
  }
  return { moves: rows, total: rows.length };
};

/** How many item moves wait for this person's answer (134), for the nav's Requests count. */
export const countItemMovesToAnswer = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<number> => {
  const user = actor.user;
  if (!user) return 0;
  const pending = await deps.repo.pendingItemMoves(
    answersItemMovesIn(user),
    PENDING_ITEM_MOVES_SHOWN,
  );
  return pending.filter((move) => move.requestedBy !== user.id).length;
};

/** One change of the item's name on its History tab (134). */
export type ItemHistoryEntry = {
  id: string;
  at: Date;
  reason: NameHistoryRow["reason"];
  /** The names, or null for one in a workspace the reader can't see (093). */
  from: string | null;
  to: string | null;
  /** Who asked and who approved, by display name; the same person when nobody had to answer. */
  askedBy: string | null;
  approvedBy: string | null;
  /** Nobody had to answer: asked and approved by the same person. */
  direct: boolean;
};

/**
 * The item's History tab (134): its name now, then each change, newest first. Read back in time,
 * the item stays in the workspace it's in now until a scope's move (115) brought it from another:
 * a name in a workspace the reader can't see shows as hidden, never its name, so History tells
 * nobody where a private item came from. A scope's move whose source is gone, or unknown (moves
 * before 134), counts as hidden unless the old name's workspace is one the reader sees by name.
 * Null for an item the reader doesn't see.
 */
export const itemHistory = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  itemId: string,
): Promise<{ current: string; entries: ItemHistoryEntry[] } | null> => {
  const item = await repo.itemForMove(itemId);
  if (!item) return null;
  const all = await repo.list();
  const viewer = visibleWorkspaces(actor.user, all);
  const sees = (workspaceId: string) => seesWorkspace(viewer, workspaceId);
  const workspace = all.find((w) => w.id === item.workspaceId);
  if (!workspace || !sees(workspace.id)) return null;
  const byName = new Map(all.map((w) => [w.name, w]));
  const seenByName = (name: string) => {
    const parts = parseItemName(name);
    const named = parts ? byName.get(parts.workspace) : undefined;
    return named !== undefined && sees(named.id);
  };
  let visible = true;
  const entries: ItemHistoryEntry[] = [];
  for (const row of await repo.itemNameHistory(item.id)) {
    const fromVisible: boolean =
      row.reason !== "move_scope"
        ? visible
        : row.fromWorkspaceId
          ? sees(row.fromWorkspaceId)
          : seenByName(row.oldName);
    entries.push({
      id: row.id,
      at: row.createdAt,
      reason: row.reason,
      from: fromVisible ? row.oldName : null,
      to: visible ? row.newName : null,
      askedBy: row.requestedByName,
      approvedBy: row.decidedByName,
      direct: row.requestedBy !== null && row.requestedBy === row.decidedBy,
    });
    visible = fromVisible;
  }
  return {
    current: formatItemName({ workspace: workspace.name, scope: item.scopeName, name: item.name }),
    entries,
  };
};
