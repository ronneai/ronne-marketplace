import type { NewAuditEvent } from "../../audit/models/audit-event";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can, requirePermission } from "../../identity/models/permissions";
import { WorkspaceNotFoundError } from "../../workspaces/exceptions/errors";
import {
  PinLimitError,
  PinNeedsPublicWorkspaceError,
  ShelfItemNotAvailableError,
} from "../exceptions/errors";
import { canonicalId, MAX_PINS, type Shelf } from "../models/shelf";
import type { PinRepository } from "../repositories/pin-repository";
import type { ShelfItemsRepository } from "../repositories/shelf-items-repository";
import type { FavoriteActor as PinActor } from "./favorites";

/**
 * The pin shelves (feature 125): the instance's "Start here" (root pins) and each workspace's (its
 * admins and root pin). Who may pin is decided here, on the server, before anything else is looked
 * at, so a refusal says nothing about the item. A shelf is read for the viewer (093): a pin of an
 * item they can't see is not in what they get.
 */
export type PinDeps = {
  pins: PinRepository;
  /** Built for the viewer (093). */
  items: ShelfItemsRepository;
  now?: () => Date;
};

export type { PinActor };

const now = (deps: PinDeps) => (deps.now ?? (() => new Date()))();

/** Throws unless the actor may change this shelf; returns the shelf's workspace name, or null. */
const requireManage = async (
  deps: PinDeps,
  actor: PinActor,
  shelf: Shelf,
): Promise<{ id: string; workspace: string | null }> => {
  if (shelf.kind === "instance") {
    requirePermission(actor.user, "pins.manage_global");
    return { id: "", workspace: null };
  }
  // Without the permission in this workspace, a workspace that doesn't exist and one that does look
  // the same: forbidden.
  const id = canonicalId(shelf.workspaceId);
  requirePermission(actor.user, "pins.manage", id);
  const workspace = await deps.items.workspace(id);
  if (!workspace) throw new WorkspaceNotFoundError();
  return { id: workspace.id, workspace: workspace.name };
};

const eventOf = (
  actor: PinActor,
  action: "pin.added" | "pin.removed" | "pin.reordered",
  target: { id: string; workspace: string | null },
  metadata: { itemId: string; name?: string; direction?: "up" | "down" },
): NewAuditEvent => ({
  actorId: actor.user?.id ?? null,
  action,
  target: target.workspace === null ? { type: "instance" } : { type: "workspace", id: target.id },
  metadata: {
    itemId: metadata.itemId,
    ...(metadata.name ? { name: metadata.name } : {}),
    ...(metadata.direction ? { direction: metadata.direction } : {}),
    ...(target.workspace === null ? {} : { workspace: target.workspace }),
  },
  ipAddress: actor.ip,
});

/** Pins an item last on the shelf: "exists" when it already is there. */
export const pinItem = async (
  deps: PinDeps,
  actor: PinActor,
  shelf: Shelf,
  itemId: string,
): Promise<"added" | "exists"> => {
  const where = await requireManage(deps, actor, shelf);
  const id = canonicalId(itemId);
  const fact = (await deps.items.facts([id])).get(id);
  if (fact?.availability !== "available") throw new ShelfItemNotAvailableError();
  if (shelf.kind === "instance" && fact.workspaceVisibility !== "public")
    throw new PinNeedsPublicWorkspaceError();
  const at = now(deps);
  const outcome = await deps.pins.add(shelf, id, {
    by: actor.user?.id as string,
    at,
    limit: MAX_PINS,
    audit: eventOf(actor, "pin.added", where, { itemId: id, name: fact.name }),
  });
  if (outcome === "full") throw new PinLimitError(where.workspace, MAX_PINS);
  return outcome;
};

/** Unpins an item, whatever became of it (a pin that is "Not available" can be removed). */
export const unpinItem = async (
  deps: PinDeps,
  actor: PinActor,
  shelf: Shelf,
  itemId: string,
): Promise<boolean> => {
  const where = await requireManage(deps, actor, shelf);
  const id = canonicalId(itemId);
  // An item the actor can't see answers as an unknown one does: a pin that is "Not available" is
  // still seen (it is released or not, but in a workspace they see) and can be removed.
  const fact = (await deps.items.facts([id])).get(id);
  if (!fact) return false;
  return deps.pins.remove(shelf, id, {
    event: eventOf(actor, "pin.removed", where, { itemId: id, name: fact.name }),
    at: now(deps),
  });
};

/** Moves an item one place up or down its shelf; "edge" when it is already there. */
export const movePin = async (
  deps: PinDeps,
  actor: PinActor,
  shelf: Shelf,
  itemId: string,
  direction: "up" | "down",
): Promise<"moved" | "edge" | "missing"> => {
  const where = await requireManage(deps, actor, shelf);
  const id = canonicalId(itemId);
  const fact = (await deps.items.facts([id])).get(id);
  if (!fact) return "missing";
  return deps.pins.move(shelf, id, direction, {
    event: eventOf(actor, "pin.reordered", where, { itemId: id, name: fact.name, direction }),
    at: now(deps),
  });
};

export type ShelfEntry = {
  itemId: string;
  position: number;
  availability: "available" | "unavailable";
};

/**
 * The shelf in order, for what the viewer sees: pins of items they can't see are left out. Home and
 * the workspace page show only the available ones; Manage (`include: "all"`, for whoever may change
 * the shelf) also lists the ones that are "Not available", so they can be removed.
 */
export const listPins = async (
  deps: PinDeps,
  actor: PinActor,
  shelf: Shelf,
  include: "available" | "all" = "available",
): Promise<ShelfEntry[]> => {
  if (!actor.user) throw new ForbiddenError("account.manage_own");
  if (include === "all") await requireManage(deps, actor, shelf);
  else if (shelf.kind === "workspace" && !(await deps.items.workspace(shelf.workspaceId)))
    return [];
  const pins = await deps.pins.list(shelf);
  const seen = await deps.items.availability(pins.map((pin) => pin.itemId));
  return pins.flatMap((pin) => {
    const availability = seen.get(pin.itemId);
    if (!availability || (include === "available" && availability !== "available")) return [];
    return [{ itemId: pin.itemId, position: pin.position, availability }];
  });
};

/** Whether the actor may pin to the shelf: for the item page's Pin menu. */
export const mayManage = (actor: PinActor, shelf: Shelf): boolean =>
  shelf.kind === "instance"
    ? can(actor.user, "pins.manage_global")
    : can(actor.user, "pins.manage", canonicalId(shelf.workspaceId));
