import { loadConfig } from "../../../config";
import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyUserDataRepository } from "../repositories/kysely-user-data-repository";
import * as service from "../services/user-data-export";
import { getCurrentUser } from "./session";

export type { UserData } from "../models/user-data";

/** Entry points for the data file (104). Thin: who's asking, and the dependencies. */
const deps = ({ db, dialect }: AppAuth): service.UserDataDeps => ({
  repo: kyselyUserDataRepository(db, dialect),
  url: loadConfig().publicUrl ?? null,
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** The file for `userId`: the signed-in person's own, or root's for anyone. */
export const exportUserData = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => service.exportUserData(deps(app), await actor(headers, app), userId);

/** When the signed-in person last downloaded their data, for their Account page. */
export const myLastExport = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const user = await getCurrentUser(headers, app);
  return user ? service.lastExport(deps(app), user.id) : null;
};
