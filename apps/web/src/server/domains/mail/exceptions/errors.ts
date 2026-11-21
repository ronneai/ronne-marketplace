import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";

/** A field of the Email tab that can be refused on save (189). */
export type MailSetupField =
  | "transport"
  | "fromAddress"
  | "fromName"
  | "replyTo"
  | "contact"
  | "smtpHost"
  | "smtpPort"
  | "smtpTls"
  | "smtpUser"
  | "secret"
  | "secretInvalid"
  | "secretWithoutUser"
  | "noAuthSecret"
  | "region"
  | "domain"
  | "sesAccessKeyId";

const MESSAGES: Record<MailSetupField, string> = {
  transport: "Choose how email leaves the server.",
  fromAddress: "The sender is an email address, ASCII only.",
  fromName: "The sender's name is 100 characters at most, on one line.",
  replyTo: "Reply-To is an email address, ASCII only, and it's required.",
  contact:
    "The instance contact is an email address or an https:// address without a user name, 500 characters at most.",
  smtpHost: "The SMTP host is a host name or an address.",
  smtpPort: "The port is a whole number from 1 to 65535.",
  smtpTls: "Choose TLS, STARTTLS, or no TLS for a relay the operator lists.",
  smtpUser: "The user name is 256 characters at most, on one line.",
  secret: "Type the credential: this transport needs one, and none is saved for it.",
  secretInvalid: "The credential is 4,096 characters at most, on one line.",
  secretWithoutUser: "A password is kept only with a user name: type the user name too.",
  noAuthSecret:
    "The server has no AUTH_SECRET to seal the credential with: set it, then save again.",
  region: "Choose the provider's region.",
  domain: "The sending domain is a domain name, such as mg.example.com.",
  sesAccessKeyId: "The access key ID is 16 to 128 capital letters and digits.",
};

/** Errors the mail domain raises. Pages turn them into `ERR:` lines. */
export class MailError extends Error {
  override readonly name: string = "MailError";
  // Its messages are for people: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;
}

/** A field of the setup that can't be saved as typed. */
export class InvalidMailSetupError extends MailError {
  override readonly name: string = "InvalidMailSetupError";
  constructor(readonly field: MailSetupField) {
    super(MESSAGES[field]);
  }
}

/** The SMTP host resolves to an address on the server's own network, and the operator didn't list it. */
export class MailHostInternalError extends MailError {
  override readonly name: string = "MailHostInternalError";
  constructor() {
    super(
      "That host is on a private network. A relay there works only once the operator lists it in RONNE_MAIL_HOSTS on the server.",
    );
  }
}

/** The SMTP host doesn't resolve. */
export class MailHostUnresolvedError extends MailError {
  override readonly name: string = "MailHostUnresolvedError";
  constructor() {
    super("That host name doesn't resolve.");
  }
}

/** Plain SMTP is only for a relay the operator lists, and never with a user name. */
export class MailPlainSmtpError extends MailError {
  override readonly name: string = "MailPlainSmtpError";
  constructor() {
    super(
      "No TLS is only for a relay the operator lists in RONNE_MAIL_HOSTS, and never with a user name and password.",
    );
  }
}
