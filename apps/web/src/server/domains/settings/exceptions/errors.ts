import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
import type { NoticeField, NoticeProblem } from "../models/notice-policy";
/** Errors the settings domain raises. Pages turn them into `ERR:` lines. */
export class SettingsError extends Error {
  override readonly name: string = "SettingsError";
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidUsagePolicyError extends SettingsError {
  override readonly name: string = "InvalidUsagePolicyError";
  constructor() {
    super("Choose off, people choose, or required.");
  }
}

export class InvalidUsageMinimumError extends SettingsError {
  override readonly name: string = "InvalidUsageMinimumError";
  constructor() {
    super("The minimum is a whole number from 0 to 10,000; 0 shows usage as soon as there's any.");
  }
}

export class InvalidRetentionError extends SettingsError {
  override readonly name: string = "InvalidRetentionError";
  constructor(which: "ipDays" | "sessionsDays") {
    super(
      `${which === "ipDays" ? "IP addresses" : "Expired sessions"} are kept for a whole number of days from 1 to 3,650.`,
    );
  }
}

export class InvalidTwoFactorPolicyError extends SettingsError {
  override readonly name: string = "InvalidTwoFactorPolicyError";
  constructor() {
    super("Choose optional, reviewers and root, or everyone.");
  }
}

export class InvalidPasswordSignInPolicyError extends SettingsError {
  override readonly name: string = "InvalidPasswordSignInPolicyError";
  constructor() {
    super("Choose everyone, or root only.");
  }
}

/** Root only needs a provider people can sign in with instead (106). */
export class NoUsableProviderError extends SettingsError {
  override readonly name: string = "NoUsableProviderError";
  constructor() {
    super("Turn on an identity provider that has passed its Test sign-in first.");
  }
}

export class ConfirmationNeededError extends SettingsError {
  override readonly name: string = "ConfirmationNeededError";
  constructor() {
    super("Confirm that everyone but root loses their password sign-in.");
  }
}

const NOTICE_WORDS: Record<NoticeProblem, string> = {
  empty: "Write the message before showing the notice.",
  too_long:
    "Use up to 500 characters on one line for the message, and up to 60 for the link's label.",
  link_incomplete: "A link needs both its label and its address.",
  link_address: "The address starts with https:// or, for a page on this site, with a single /.",
  tone: "Choose information or warning.",
};

/** The notice form was refused (124): `field` says where the message goes. */
export class InvalidNoticeError extends SettingsError {
  override readonly name: string = "InvalidNoticeError";
  constructor(
    readonly field: NoticeField,
    readonly problem: NoticeProblem,
  ) {
    super(NOTICE_WORDS[problem]);
  }
}
