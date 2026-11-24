import type {
  ResetCompleted,
  ResetRequested,
  StepRefusal,
} from "@/server/domains/identity/services/password-reset";

/** What the request page shows after a refusal, and what was typed (194). */
export type ResetRequestState = {
  error?: Extract<ResetRequested, { ok: false }>["refusal"];
  email?: string;
  /** A new challenge: each answer is taken once, so a refused form needs another. */
  challenge?: string;
};

/** What the code and two-factor pages show after a refused code (194). */
export type ResetStepState = { error?: StepRefusal };

/** What the new-password page shows after a refusal (194). */
export type NewPasswordState = { error?: Extract<ResetCompleted, { ok: false }>["refusal"] };
