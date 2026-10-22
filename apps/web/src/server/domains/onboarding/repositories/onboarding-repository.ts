import type { Onboarding } from "../models/onboarding";

/**
 * The Getting started checklist's state (feature 126), one row per person. Kysely in
 * kysely-onboarding-repository.ts. Every write is an upsert of the columns it names, so two writes
 * at once (the panel hidden in one tab, an install confirmed in another) never undo each other.
 * The person must exist: the foreign key is the check.
 */
export interface OnboardingRepository {
  /** The person's state; every column null when they have no row. */
  get(userId: string): Promise<Onboarding>;
  /** Hides the panel. */
  hide(userId: string, at: Date): Promise<void>;
  /** Records that they installed an item (step 3). Keeps the first time if it is already set. */
  confirmInstall(userId: string, at: Date): Promise<void>;
  /** Marks "You're set up" as seen. Keeps the first time if it is already set. */
  markCompletedSeen(userId: string, at: Date): Promise<void>;
  /** Brings the panel back: clears hidden and seen, keeps the confirmed install. */
  show(userId: string, at: Date): Promise<void>;
  /** Deletes the person's row (erasing, 103). True when there was one. */
  remove(userId: string): Promise<boolean>;
}
