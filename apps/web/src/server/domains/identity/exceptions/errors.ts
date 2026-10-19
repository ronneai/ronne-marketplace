import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the identity domain raises. http/ and the setup script turn them into messages. */
export class IdentityError extends Error {
  override readonly name: string = "IdentityError";
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidEmailError extends IdentityError {
  override readonly name: string = "InvalidEmailError";
  constructor(readonly email: string) {
    super(`"${email}" isn't a valid email address.`);
  }
}

export class InvalidNameError extends IdentityError {
  override readonly name: string = "InvalidNameError";
  constructor() {
    super("The display name can't be empty, and has at most 255 characters.");
  }
}

export class InvalidPasswordError extends IdentityError {
  override readonly name: string = "InvalidPasswordError";
  constructor(
    readonly reason: "too_short" | "too_long",
    limit: number,
  ) {
    super(
      reason === "too_short"
        ? `The password needs at least ${limit} characters.`
        : `The password can have at most ${limit} characters.`,
    );
  }
}

export class RootAlreadyExistsError extends IdentityError {
  override readonly name: string = "RootAlreadyExistsError";
  constructor(readonly email: string) {
    super(`A root account already exists (${email}). Setup never creates another.`);
  }
}

export class RootNotFoundError extends IdentityError {
  override readonly name: string = "RootNotFoundError";
  constructor() {
    super("There's no root account yet. Run `pnpm run setup` to create one.");
  }
}

/** reset-root-password with several roots and no `--email` (059). */
export class WhichRootError extends IdentityError {
  override readonly name: string = "WhichRootError";
  constructor(readonly count: number) {
    super(`There are ${count} root accounts. Say which with --email.`);
  }
}

/** reset-root-password's `--email` names someone who isn't root: it never promotes (059). */
export class NotARootError extends IdentityError {
  override readonly name: string = "NotARootError";
  constructor(readonly email: string) {
    super(`${email} isn't a root account.`);
  }
}

export class NotConfiguredError extends IdentityError {
  override readonly name: string = "NotConfiguredError";
  constructor() {
    super(
      "Ronne AI Marketplace isn't set up yet: there's no DATABASE_URL or AUTH_SECRET. Run `pnpm run setup`.",
    );
  }
}

export class ForbiddenError extends IdentityError {
  override readonly name: string = "ForbiddenError";
  constructor(readonly permission: string) {
    super(`You don't have permission to do this (${permission}).`);
  }
}

export class UserNotFoundError extends IdentityError {
  override readonly name: string = "UserNotFoundError";
  constructor() {
    super("That user doesn't exist.");
  }
}

/** The account was erased (103): nothing may change it, sign in to it or provision it again. */
export class UserErasedError extends IdentityError {
  override readonly name: string = "UserErasedError";
  constructor() {
    super("That account was erased. It can't be changed, signed in to or provisioned again.");
  }
}

export class EmailTakenError extends IdentityError {
  override readonly name: string = "EmailTakenError";
  constructor(readonly email: string) {
    super(`A user with the email ${email} already exists.`);
  }
}

/** A root acting on their own row: another root changes it (feature 059). */
export class CannotModifySelfError extends IdentityError {
  override readonly name: string = "CannotModifySelfError";
  constructor() {
    super(
      "You can't change your own role or account here. Change your password in Account; another root can change the rest.",
    );
  }
}

/** The change would leave no enabled root, and the instance unmanageable (feature 059). */
export class LastRootError extends IdentityError {
  override readonly name: string = "LastRootError";
  constructor() {
    super("This would leave the instance without an active root. Make someone else root first.");
  }
}

export class InvalidRoleError extends IdentityError {
  override readonly name: string = "InvalidRoleError";
  constructor(readonly role: string) {
    super(`"${role}" isn't a role. Use user or root; moderator is a role in a workspace.`);
  }
}

export class InvalidTokenNameError extends IdentityError {
  override readonly name: string = "InvalidTokenNameError";
  constructor() {
    super("A token name needs 1 to 100 characters.");
  }
}

export class InvalidTokenLifetimeError extends IdentityError {
  override readonly name: string = "InvalidTokenLifetimeError";
  constructor(readonly value: string) {
    super(`"${value}" isn't a token lifetime. Use 30, 90 or 365 days, or no expiry.`);
  }
}

export class TokenLimitError extends IdentityError {
  override readonly name: string = "TokenLimitError";
  constructor(readonly limit: number) {
    super(`You have ${limit} active tokens, the most allowed. Revoke an old token first.`);
  }
}

export class TokenNameTakenError extends IdentityError {
  override readonly name: string = "TokenNameTakenError";
  constructor(readonly tokenName: string) {
    super(`You already have an active token named "${tokenName}".`);
  }
}

export class TokenNotFoundError extends IdentityError {
  override readonly name: string = "TokenNotFoundError";
  constructor() {
    super("That token doesn't exist, or isn't yours.");
  }
}

/** An identity provider id that breaks the rules (106): it is in the redirect URI, chosen once. */
export class InvalidProviderIdError extends IdentityError {
  override readonly name: string = "InvalidProviderIdError";
  constructor(readonly id: string) {
    super(
      "A provider id has 3 to 32 lowercase letters, digits and dashes, starts and ends with a letter or digit, and isn't credential.",
    );
  }
}

export class ProviderIdTakenError extends IdentityError {
  override readonly name: string = "ProviderIdTakenError";
  constructor(readonly id: string) {
    super(`Another provider already has the id ${id}.`);
  }
}

export class InvalidProviderDomainsError extends IdentityError {
  override readonly name: string = "InvalidProviderDomainsError";
  constructor(readonly domain: string) {
    super(
      domain
        ? `"${domain}" isn't an email domain. Write domains like example.com, separated by commas.`
        : "Write email domains like example.com, separated by commas.",
    );
  }
}

/** What root typed for a provider is incomplete or wrong; `fields` names each field and why. */
export class InvalidProviderConfigError extends IdentityError {
  override readonly name: string = "InvalidProviderConfigError";
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields).join(" "));
  }
}

export class InvalidProviderNameError extends IdentityError {
  override readonly name: string = "InvalidProviderNameError";
  constructor() {
    super("The display name needs 1 to 100 characters.");
  }
}

export class UnknownProviderTypeError extends IdentityError {
  override readonly name: string = "UnknownProviderTypeError";
  constructor(readonly type: string) {
    super(`"${type}" isn't a kind of identity provider Ronne knows.`);
  }
}

export class ProviderNotFoundError extends IdentityError {
  override readonly name: string = "ProviderNotFoundError";
  constructor() {
    super("That identity provider doesn't exist.");
  }
}

/** Turning a provider on needs a passing *Test sign-in* by the root turning it on (106). */
export class ProviderNotTestedError extends IdentityError {
  override readonly name: string = "ProviderNotTestedError";
  constructor() {
    super("Run Test sign-in yourself, and pass it, before turning this provider on.");
  }
}

/** Someone saved the provider since this form was opened (106's version check). */
export class StaleProviderError extends IdentityError {
  override readonly name: string = "StaleProviderError";
  constructor(readonly updatedAt: Date) {
    super("Someone changed this provider since you opened it. Reload to see their changes.");
  }
}

/** A SCIM token is made only while SCIM is on for the provider (108). */
export class ScimOffError extends IdentityError {
  override readonly name: string = "ScimOffError";
  constructor() {
    super("Turn on SCIM for this provider first.");
  }
}

/** The provider has a SCIM token already: Rotate makes a new one (108). */
export class ScimTokenExistsError extends IdentityError {
  override readonly name: string = "ScimTokenExistsError";
  constructor() {
    super("This provider has a SCIM token already. Rotate it to get a new one.");
  }
}

/** Rotate needs a current SCIM token (108). */
export class NoScimTokenError extends IdentityError {
  override readonly name: string = "NoScimTokenError";
  constructor() {
    super("This provider has no SCIM token to rotate. Generate one.");
  }
}

/** The stored client secret can't be decrypted: AUTH_SECRET changed, as after a restore. */
export class ProviderSecretUnreadableError extends IdentityError {
  override readonly name: string = "ProviderSecretUnreadableError";
  constructor() {
    super("The client secret can't be read with this AUTH_SECRET. Enter the client secret again.");
  }
}

/**
 * A sign-in with a provider that didn't go through (106): the provider refused or didn't answer
 * (`provider_error`), or what it sent back isn't valid (`invalid_response`). `detail` is for the
 * log (redacted), never shown.
 */
export class ProviderFlowError extends IdentityError {
  override readonly name: string = "ProviderFlowError";
  constructor(
    readonly reason: "provider_error" | "invalid_response",
    readonly detail: string,
  ) {
    super(
      reason === "provider_error"
        ? "That provider didn't answer. Try again, or use your password."
        : "That provider's answer couldn't be checked, so you weren't signed in.",
    );
  }
}

export class InvalidGroupMappingError extends IdentityError {
  override readonly name: string = "InvalidGroupMappingError";
  constructor(readonly reason: "group" | "role" | "workspace" | "personal") {
    super(
      reason === "group"
        ? "A group needs 1 to 255 characters, exactly as the provider sends it."
        : reason === "role"
          ? "A group gives the role user, moderator or admin."
          : reason === "workspace"
            ? "That workspace doesn't exist."
            : "A personal workspace can't be given to a group.",
    );
  }
}
