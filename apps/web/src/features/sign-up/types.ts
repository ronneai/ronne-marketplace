import type { CodeRefusal, SignUpRefusal } from "@/server/domains/identity/services/sign-up";

/** What the sign-up form shows after a refusal: the reason, its box, and what was typed (190). */
export type SignUpFormState = {
  error?: SignUpRefusal;
  field?: "name" | "email" | "password" | "terms";
  /** Root's terms as they are now, after `terms_changed`: the form shows these instead. */
  terms?: { url: string; version: string };
  name?: string;
  email?: string;
  /** A new challenge: each answer is taken once, so a refused form needs another. */
  challenge?: string;
};

/** What the code page shows after a code or a resend (190). */
export type SignUpCodeState = {
  error?: CodeRefusal | "wait";
  seconds?: number;
  resent?: boolean;
};
