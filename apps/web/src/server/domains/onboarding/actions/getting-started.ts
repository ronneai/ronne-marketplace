import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyOnboardingRepository } from "../repositories/kysely-onboarding-repository";
import { kyselyProgressRepository } from "../repositories/kysely-progress-repository";
import * as service from "../services/getting-started";

/**
 * The Getting started checklist (feature 126). Thin: the service checks everything, and none of
 * these takes a person's id, so each one can only be about whoever is signed in.
 */
const context = async (headers: Headers, app: AppAuth) => ({
  actor: {
    user: await getCurrentUser(headers, app),
    ip: clientIp(headers, app.trustProxy),
  },
  deps: {
    progress: kyselyProgressRepository(app.db),
    onboarding: kyselyOnboardingRepository(app.db, app.dialect),
  } satisfies service.GettingStartedDeps,
});

export const gettingStarted = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.gettingStarted(deps, actor);
};

export const hideGettingStarted = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.hideGettingStarted(deps, actor);
};

export const confirmInstall = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.confirmInstall(deps, actor);
};

export const showGettingStarted = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.showGettingStarted(deps, actor);
};

export const markSetUpSeen = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.markSetUpSeen(deps, actor);
};
