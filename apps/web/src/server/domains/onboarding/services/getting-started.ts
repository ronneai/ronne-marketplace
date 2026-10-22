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

const nowOf = (deps: Pick<GettingStartedDeps, "now">) => (deps.now ?? (() => new Date()))();

/** Hides the panel. */
export const hideGettingStarted = async (
  deps: GettingStartedDeps,
  actor: GettingStartedActor,
): Promise<void> => {
  await deps.onboarding.hide(signedIn(actor).id, nowOf(deps));
};

/** "I've installed one": step 3. Allowed whatever else is done; the first time is kept. */
export const confirmInstall = async (
  deps: GettingStartedDeps,
  actor: GettingStartedActor,
): Promise<void> => {
  await deps.onboarding.confirmInstall(signedIn(actor).id, nowOf(deps));
};

/** Account's "Show getting started again": clears hidden and seen, keeps the confirmed install. */
export const showGettingStarted = async (
  deps: GettingStartedDeps,
  actor: GettingStartedActor,
): Promise<void> => {
  await deps.onboarding.show(signedIn(actor).id, nowOf(deps));
};

/**
 * "You're set up" was shown: it is gone from the next visit. Only counts once steps 1–3 are done
 * (and not while hidden), so a call made early can't use up a message the person hasn't earned.
 * Returns whether it was marked.
 */
export const markSetUpSeen = async (
  deps: GettingStartedDeps,
  actor: GettingStartedActor,
): Promise<boolean> => {
  const user = signedIn(actor);
  const state = await gettingStarted(deps, actor);
  if (state.panel !== "setUp") return false;
  await deps.onboarding.markCompletedSeen(user.id, nowOf(deps));
  return true;
};
