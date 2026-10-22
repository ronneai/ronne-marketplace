/**
 * The Getting started checklist's own state (feature 126): what the person did with the panel.
 * Each step's progress is read from the tables it lives in; this is only what no table can say.
 * No row means all three are null.
 */
export type Onboarding = {
  /** They hid the panel. */
  hiddenAt: Date | null;
  /** They said they installed an item (step 3): the registry can't tell who installs what. */
  installConfirmedAt: Date | null;
  /** They were shown "You're set up", so the panel is gone from the next visit. */
  completedSeenAt: Date | null;
};

export const NO_ONBOARDING: Onboarding = {
  hiddenAt: null,
  installConfirmedAt: null,
  completedSeenAt: null,
};
