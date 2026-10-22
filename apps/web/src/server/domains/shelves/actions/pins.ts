import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Shelf } from "../models/shelf";
import { kyselyPinRepository } from "../repositories/kysely-pin-repository";
import { kyselyShelfItemsRepository } from "../repositories/kysely-shelf-items-repository";
import * as service from "../services/pins";

export type { PinTarget, ShelfEntry } from "../services/pins";

/** The pin shelves (feature 125). Thin: the service checks everything. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const viewer = await viewerOf(user, app);
  return {
    actor: { user, ip: clientIp(headers, app.trustProxy) },
    deps: {
      pins: kyselyPinRepository(app.db, app.dialect),
      items: kyselyShelfItemsRepository(app.db, viewer),
    } satisfies service.PinDeps,
  };
};

export const pinItem = async (
  headers: Headers,
  shelf: Shelf,
  itemId: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.pinItem(deps, actor, shelf, itemId);
};

export const unpinItem = async (
  headers: Headers,
  shelf: Shelf,
  itemId: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.unpinItem(deps, actor, shelf, itemId);
};

export const movePin = async (
  headers: Headers,
  shelf: Shelf,
  itemId: string,
  direction: "up" | "down",
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.movePin(deps, actor, shelf, itemId, direction);
};

export const listPins = async (
  headers: Headers,
  shelf: Shelf,
  include: "available" | "all" = "available",
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.listPins(deps, actor, shelf, include);
};

export const pinTargets = async (headers: Headers, itemId: string, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.pinTargets(deps, actor, itemId);
};

export const workspaceNamed = async (
  headers: Headers,
  name: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.workspaceNamed(deps, actor, name);
};
