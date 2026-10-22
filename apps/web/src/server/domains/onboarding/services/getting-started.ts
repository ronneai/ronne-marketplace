import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { type GettingStarted, gettingStartedOf } from "../models/getting-started";
import type { OnboardingRepository } from "../repositories/onboarding-repository";
import type { ProgressRepository } from "../repositories/progress-repository";

/**
 * The Getting started checklist (feature 126): always the signed-in person's own, never anyone
 * else's. Every step but "I've installed one" is read from the tables at the time, so it is true
 * and nothing needs back-filling.
 */
export type GettingStartedDeps = {
  progress: ProgressRepository;
  onboarding: OnboardingRepository;
  now?: () => Date;
};

export type GettingStartedActor = { user: CurrentUser | null; ip: string | null };

export const signedIn = (actor: GettingStartedActor): CurrentUser => {
  // Signed out has no checklist; the same check every signed-in feature uses.
  if (!actor.user) throw new ForbiddenError("account.manage_own");
  return actor.user;
};

export const gettingStarted = async (
  deps: GettingStartedDeps,
  actor: GettingStartedActor,
): Promise<GettingStarted> => {
  const user = signedIn(actor);
  const [facts, state] = await Promise.all([
    deps.progress.facts(user.id),
    deps.onboarding.get(user.id),
  ]);
  return gettingStartedOf(facts, state);
};
