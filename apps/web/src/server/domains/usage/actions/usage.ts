import type { ItemType } from "@ronneai/core";
import { getCurrentUser } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { usageMinimum, usagePolicy } from "../../settings/actions/settings";
import type { UsagePolicy } from "../../settings/models/usage-policy";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import { kyselyUsageRepository } from "../repositories/kysely-usage-repository";
import * as service from "../services/usage";

/**
 * Usage reports from `rmk` (feature 046), for the API: the user comes from a bearer token. Thin:
 * the service checks everything. Root's usage policy is read on every call, so a change in
 * Admin › Settings applies at once.
 */

// The day old totals were last deleted, per server process: the first report of a day prunes.
const shared = globalThis as { __ronneUsagePrunedDay?: string };
const pruneDue = (today: string) => {
  if (shared.__ronneUsagePrunedDay === today) return false;
  shared.__ronneUsagePrunedDay = today;
  return true;
};

const deps = (app: AppAuth, viewer: Viewer, policy: UsagePolicy): service.UsageDeps => ({
  usage: kyselyUsageRepository(app.db, app.dialect, viewer),
  policy,
  now: () => new Date(),
  pruneDue,
});

export const recordUsageAs = async (
  user: CurrentUser,
  body: unknown,
  app: AppAuth = getAppAuth(),
) =>
  service.recordUsage(deps(app, await viewerOf(user, app), await usagePolicy(app)), { user }, body);

export const usageSettingsAs = async (user: CurrentUser, app: AppAuth = getAppAuth()) =>
  service.usageSettings({ policy: await usagePolicy(app) }, { user });

/** An item's usage for its page (047), as the signed-in viewer sees it. */
export const itemUsage = async (
  headers: Headers,
  item: { id: string; type: ItemType },
  app: AppAuth = getAppAuth(),
) => {
  const user = await getCurrentUser(headers, app);
  return service.itemUsage(
    {
      usage: kyselyUsageRepository(app.db, app.dialect, await viewerOf(user, app)),
      policy: await usagePolicy(app),
      minimum: await usageMinimum(app),
      now: () => new Date(),
    },
    { user },
    item,
  );
};

/** Runs and installs per version, for the Versions page (047). */
export const itemUsageByVersion = async (
  headers: Headers,
  itemId: string,
  app: AppAuth = getAppAuth(),
) => {
  const user = await getCurrentUser(headers, app);
  return service.itemUsageByVersion(
    {
      usage: kyselyUsageRepository(app.db, app.dialect, await viewerOf(user, app)),
      minimum: await usageMinimum(app),
      now: () => new Date(),
    },
    { user },
    itemId,
  );
};
