import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyEraseRepository } from "../repositories/kysely-erase-repository";
import * as service from "../services/erase-user";
import { getCurrentUser } from "./session";

export type { EraseCounts, EraseResult } from "../services/erase-user";

/** Entry points for erasing a user (103). Thin: who's asking, and the dependencies. */
const deps = ({ db, dialect }: AppAuth): service.EraseDeps => ({
  repo: kyselyEraseRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** Erases the account whose email root typed (`confirm`) to be sure; the service checks it. */
export const adminEraseUser = async (
  headers: Headers,
  userId: string,
  confirm: string,
  app: AppAuth = getAppAuth(),
) => service.eraseUser(deps(app), await actor(headers, app), userId, { confirm });

/** The erasures whose audit log rewrite isn't finished (MySQL), for the Privacy tab. */
export const adminPendingErasures = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.pendingErasures(deps(app), await actor(headers, app));

/** The Privacy tab's Retry: finishes them. Returns how many. */
export const adminRetryErasures = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.finishErasures(deps(app), { actor: await actor(headers, app) });
