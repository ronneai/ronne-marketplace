import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyUsageRepository } from "../repositories/kysely-usage-repository";
import * as service from "../services/usage";

/**
 * Usage reports from `rmk` (feature 046), for the API: the user comes from a bearer token. Thin:
 * the service checks everything. Whether the instance accepts usage comes from its settings, which
 * the HTTP layer reads.
 */

// The day old totals were last deleted, per server process: the first report of a day prunes.
const shared = globalThis as { __ronneUsagePrunedDay?: string };
const pruneDue = (today: string) => {
  if (shared.__ronneUsagePrunedDay === today) return false;
  shared.__ronneUsagePrunedDay = today;
  return true;
};

const deps = (app: AppAuth, accepting: boolean): service.UsageDeps => ({
  usage: kyselyUsageRepository(app.db, app.dialect),
  accepting,
  now: () => new Date(),
  pruneDue,
});

export const recordUsageAs = (
  user: CurrentUser,
  body: unknown,
  accepting: boolean,
  app: AppAuth = getAppAuth(),
) => service.recordUsage(deps(app, accepting), { user }, body);

export const usageSettingsAs = (user: CurrentUser, accepting: boolean) =>
  service.usageSettings({ accepting }, { user });
