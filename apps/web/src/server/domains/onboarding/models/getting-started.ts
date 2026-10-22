import type { Onboarding } from "./onboarding";

/** The four steps, in the order the panel shows them. */
export const STEPS = ["token", "connect", "install", "draft"] as const;
export type Step = (typeof STEPS)[number];

/** What the tables say about a person, one fact per detection in the spec's table. */
export type ProgressFacts = {
  /** Step 1: they have an access token that isn't revoked (one made by `rmk login --web` counts). */
  hasToken: boolean;
  /** Step 2: a token of theirs has been used, or a device grant of theirs was approved (107). */
  connected: boolean;
  /** Step 4: they have a draft or any submission. */
  hasSubmission: boolean;
};

/** What Home draws: the steps, "You're set up", or nothing. */
export type GettingStartedPanel = "steps" | "setUp" | null;

export type GettingStarted = {
  /** Which steps are done. Step 3 is the person's word (`install_confirmed_at`). */
  done: Record<Step, boolean>;
  /** How many of the four are done, for "2 of 4 done". */
  count: number;
  /** The first step not done, in order, for the highlight; null when all four are. */
  current: Step | null;
  /** Steps 1–3 are done; step 4 is optional and doesn't block it. */
  complete: boolean;
  /** Hidden by the person: Account's Show getting started again brings it back. */
  hidden: boolean;
  panel: GettingStartedPanel;
};

/**
 * Works the panel out from what exists (feature 126). Pure: the facts and the person's own state
 * in, what to show out. Complete and not yet seen shows "You're set up" once; hiding wins over
 * everything, and a person who hid it and later finishes has nothing to see until they ask again.
 */
export const gettingStartedOf = (facts: ProgressFacts, state: Onboarding): GettingStarted => {
  const done: Record<Step, boolean> = {
    token: facts.hasToken,
    connect: facts.connected,
    install: state.installConfirmedAt !== null,
    draft: facts.hasSubmission,
  };
  const complete = done.token && done.connect && done.install;
  const hidden = state.hiddenAt !== null;
  let panel: GettingStartedPanel = "steps";
  if (hidden) panel = null;
  else if (complete) panel = state.completedSeenAt === null ? "setUp" : null;
  return {
    done,
    count: STEPS.filter((step) => done[step]).length,
    current: STEPS.find((step) => !done[step]) ?? null,
    complete,
    hidden,
    panel,
  };
};
