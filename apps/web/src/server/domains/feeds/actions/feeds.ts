import { nameProblem, normalizeWorkspaceName } from "@ronneai/core";
import { after } from "next/server";
import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { viewerOf } from "../../workspaces/actions/viewer";
import { narrowedViewer, type Viewer, visibilityKey } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { FeedWorkspaceNotFoundError } from "../exceptions/errors";
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

// What the caller sees (093): their marketplace is cached per visibility key, the private
// workspaces they see, so everyone who sees only public ones shares one.
const deps = (
  { db, dialect }: AppAuth,
  storage: StorageAdapter,
  viewer: Viewer,
): service.FeedDeps => ({
  catalogue: kyselyCatalogueRepository(db, dialect, viewer),
  items: kyselyItemRepository(db, dialect, viewer),
  feeds: kyselyFeedRepository(db, dialect),
  storage,
  cache: marketplaceCache(),
  visibility: visibilityKey(viewer),
  // Finishing a feed after the response is sent: `after` keeps it alive past the request.
  background: (work) => after(work),
});

/**
 * The caller's viewer, cut down for a git mirror when `workspaces` is given (093): the public
 * workspaces and the private ones it names. A name the caller doesn't see, unknown or private
 * without them, is refused with one message for both. A public one adds nothing.
 */
const feedViewer = async (
  user: CurrentUser,
  workspaces: readonly string[] | null,
  app: AppAuth,
) => {
  const viewer = await viewerOf(user, app);
  if (workspaces === null) return viewer;
  const repo = kyselyWorkspaceRepository(app.db, app.dialect);
  const chosen: string[] = [];
  for (const name of workspaces) {
    // Only a valid name is looked up: a NUL or an accented letter could otherwise fail on
    // PostgreSQL or match another name under MySQL's collation.
    const normalized = normalizeWorkspaceName(name);
    const workspace = nameProblem(normalized, "item") ? null : await repo.findByName(normalized);
    if (!workspace || !viewer.workspaceIds.includes(workspace.id))
      throw new FeedWorkspaceNotFoundError(name);
    chosen.push(workspace.id);
  }
  return narrowedViewer(viewer, chosen);
};

/**
 * The tool's marketplace file, its URLs on the instance's PUBLIC_URL: what the user sees, or, with
 * `workspaces` (a mirror, 093), the public workspaces and the private ones it names.
 */
export const marketplaceAs = async (
  user: CurrentUser,
  tool: ServedTool,
  publicUrl: string,
  workspaces: readonly string[] | null = null,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  // The revision is read before the viewer, so a visibility change in between (which raises it)
  // can only leave this marketplace cached under a revision nobody asks for any more. Read after,
  // a viewer from before Make private would cache what outsiders no longer see under the new one.
  const feeds = kyselyFeedRepository(app.db, app.dialect);
  const revision = await feeds.revision();
  const viewer = await feedViewer(user, workspaces, app);
  return service.marketplace(
    { ...deps(app, storage, viewer), feeds: { ...feeds, revision: async () => revision } },
    { user, ip: null },
    tool,
    publicUrl,
  );
};

/** A version's plugin and its sha256, without reading or counting it: for 304s. */
export const findPluginAs = async (
  user: CurrentUser,
  tool: ServedTool,
  ref: PluginRef,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.findPlugin(deps(app, storage, await viewerOf(user, app)), { user, ip: null }, tool, ref);

/** A version's plugin zip, counted as a download. */
export const downloadPluginAs = async (
  user: CurrentUser,
  tool: ServedTool,
  ref: PluginRef,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.downloadPlugin(
    deps(app, storage, await viewerOf(user, app)),
    { user, ip: null },
    tool,
    ref,
  );

/** Each tool's largest marketplace of the current revision, for Admin › Settings (079, 093): root only. */
export const pluginFeedStats = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  feedStatsFor(
    { feeds: kyselyFeedRepository(app.db, app.dialect) },
    { user: await getCurrentUser(headers, app), ip: null },
  );
