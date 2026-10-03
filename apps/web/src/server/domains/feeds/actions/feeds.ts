import { after } from "next/server";
import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import type { PluginRef, ServedTool } from "../models/feed";
import { kyselyFeedRepository } from "../repositories/kysely-feed-repository";
import { feedStatsFor } from "../services/feed-stats";
import { createMarketplaceCache, type MarketplaceCache } from "../services/marketplace-cache";
import * as service from "../services/plugin-feed";

export type { FeedPlugin, FeedStats, FeedWarning, PluginRef, ServedTool } from "../models/feed";
export {
  inClaudeCodeFeed,
  isServedTool,
  marketplaceUrl,
  pluginInstallCommand,
} from "../models/feed";
export type { FeedStatsRow } from "../services/feed-stats";

/**
 * Entry points for the plugin feeds (feature 077), for `/api/v1/feeds`, where the user comes from a
 * bearer token. Thin: the service checks everything.
 */
// One marketplace cache per server process, kept on globalThis like the storage adapters, so a
// hot reload in development keeps it (079).
const shared = globalThis as typeof globalThis & { __ronneMarketplaceCache?: MarketplaceCache };
const marketplaceCache = () => {
  shared.__ronneMarketplaceCache ??= createMarketplaceCache();
  return shared.__ronneMarketplaceCache;
};

const deps = ({ db, dialect }: AppAuth, storage: StorageAdapter): service.FeedDeps => ({
  catalogue: kyselyCatalogueRepository(db, dialect),
  items: kyselyItemRepository(db, dialect),
  feeds: kyselyFeedRepository(db, dialect),
  storage,
  cache: marketplaceCache(),
  // Finishing a feed after the response is sent: `after` keeps it alive past the request.
  background: (work) => after(work),
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

/** Each tool's last marketplace build, for Admin › Settings (079): root only. */
export const pluginFeedStats = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  feedStatsFor(
    { feeds: kyselyFeedRepository(app.db, app.dialect) },
    { user: await getCurrentUser(headers, app), ip: null },
  );
