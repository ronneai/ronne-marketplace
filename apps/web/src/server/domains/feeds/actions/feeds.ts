import { getStorage, type StorageAdapter } from "../../../storage";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import type { PluginRef, ServedTool } from "../models/feed";
import * as service from "../services/plugin-feed";

export type { FeedPlugin, PluginRef, ServedTool } from "../models/feed";
export { isServedTool, marketplaceUrl } from "../models/feed";

/**
 * Entry points for the plugin feeds (feature 077), for `/api/v1/feeds`, where the user comes from a
 * bearer token. Thin: the service checks everything.
 */
const deps = ({ db, dialect }: AppAuth, storage: StorageAdapter): service.FeedDeps => ({
  catalogue: kyselyCatalogueRepository(db, dialect),
  items: kyselyItemRepository(db, dialect),
  storage,
});

/** The tool's marketplace file, its URLs on the instance's PUBLIC_URL. */
export const marketplaceAs = (
  user: CurrentUser,
  tool: ServedTool,
  publicUrl: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => service.marketplace(deps(app, storage), { user, ip: null }, tool, publicUrl);

/** A version's plugin and its sha256, without reading or counting it: for 304s. */
export const findPluginAs = (
  user: CurrentUser,
  tool: ServedTool,
  ref: PluginRef,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => service.findPlugin(deps(app, storage), { user, ip: null }, tool, ref);

/** A version's plugin zip, counted as a download. */
export const downloadPluginAs = (
  user: CurrentUser,
  tool: ServedTool,
  ref: PluginRef,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => service.downloadPlugin(deps(app, storage), { user, ip: null }, tool, ref);
