import { formatItemName, parseItemName } from "@ronneai/core";
import { can } from "../../identity/models/permissions";
import { renamedManifest } from "../../submissions/models/manifest-names";
import {
  ItemMoveItemNotFoundError,
  ItemMoveSameScopeError,
  ItemMoveScopeNotFoundError,
} from "../exceptions/errors";
import type { ItemMoveClash, ItemMoveImpact } from "../models/item-move";
import type { Workspace } from "../models/workspace";
import type { ItemForMove, WorkspaceRepository } from "../repositories/workspace-repository";
import type { WorkspaceActor } from "./workspaces";

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
