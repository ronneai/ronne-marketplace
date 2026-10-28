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
  constructor(readonly which: "ipDays" | "sessionsDays" | "feedbackDays") {
    const what = {
      ipDays: "IP addresses",
      sessionsDays: "Expired sessions",
      feedbackDays: "Handled feedback",
    }[which];
    super(`${what} are kept for a whole number of days from 1 to 3,650.`);
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
  too_long: "Use up to 500 characters on one line for the message.",
  link_label: "A link needs its words, up to 60 characters: [words](address).",
  link_address: "The address starts with https:// or, for a page on this site, with a single /.",
  too_many_links: "Use at most 3 links in the message.",
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

/** Scanning can't be turned on without the scanner's command, which only the operator sets (135). */
export class SkillScanNotConfiguredError extends SettingsError {
  override readonly name: string = "SkillScanNotConfiguredError";
  constructor() {
    super(
      "Set RONNE_SKILL_SCANNER on the server (the scanner's command, as a JSON array) and restart Ronne first.",
    );
  }
}

/** Semantic analysis needs a provider the operator set up (135). */
export class SkillScanNoProviderError extends SettingsError {
  override readonly name: string = "SkillScanNoProviderError";
  constructor() {
    super(
      "Set up an LLM provider on the server first (RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER and its variables), then restart Ronne.",
    );
  }
}

export class InvalidSkillScanTypesError extends SettingsError {
  override readonly name: string = "InvalidSkillScanTypesError";
  constructor() {
    super("Pick at least one item type to scan.");
  }
}

export class InvalidSkillScanAnalysisError extends SettingsError {
  override readonly name: string = "InvalidSkillScanAnalysisError";
  constructor() {
    super("Choose static, or static and semantic.");
  }
}

export class InvalidScanProviderError extends SettingsError {
  override readonly name: string = "InvalidScanProviderError";
  constructor() {
    super("Choose one of the providers listed, or none.");
  }
}

export class InvalidScanModelError extends SettingsError {
  override readonly name: string = "InvalidScanModelError";
  constructor() {
    super("Enter a model name of at most 128 characters, on one line.");
  }
}

export class InvalidScanTimeoutError extends SettingsError {
  override readonly name: string = "InvalidScanTimeoutError";
  constructor() {
    super("Enter a timeout from 30 to 3600 seconds, or leave it empty for 300.");
  }
}

export class InvalidScanCommandError extends SettingsError {
  override readonly name: string = "InvalidScanCommandError";
  constructor() {
    super("Choose one of the scanner commands the server lists.");
  }
}

export class InvalidScanKeyError extends SettingsError {
  override readonly name: string = "InvalidScanKeyError";
  constructor() {
    super("Enter the API key on one line, at most 4096 characters, for a provider that takes one.");
  }
}

export class InvalidScanEndpointError extends SettingsError {
  override readonly name: string = "InvalidScanEndpointError";
  constructor() {
    super(
      "Enter the endpoint as a URL, such as https://api.example.com/v1, with no spaces or backslashes.",
    );
  }
}

export class ScanEndpointCredentialsError extends SettingsError {
  override readonly name: string = "ScanEndpointCredentialsError";
  constructor() {
    super(
      "Leave the user name and password out of the endpoint: enter the API key in its own field.",
    );
  }
}

export class ScanEndpointNotHttpsError extends SettingsError {
  override readonly name: string = "ScanEndpointNotHttpsError";
  constructor() {
    super(
      "The endpoint must start with https://. The server's operator can allow http:// for a host in RONNE_SKILL_SCANNER_HTTP_HOSTS.",
    );
  }
}

export class ScanEndpointInternalError extends SettingsError {
  override readonly name: string = "ScanEndpointInternalError";
  constructor() {
    super(
      "That endpoint is on a private, loopback or link-local address, which isn't allowed. The server's operator can allow its host in RONNE_SKILL_SCANNER_HTTP_HOSTS.",
    );
  }
}

export class ScanEndpointUnresolvedError extends SettingsError {
  override readonly name: string = "ScanEndpointUnresolvedError";
  constructor() {
    super("That endpoint's host can't be found. Check its name.");
  }
}
