/** Errors the identity domain raises. http/ and the setup script turn them into messages. */
export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidEmailError extends IdentityError {
  constructor(readonly email: string) {
    super(`"${email}" isn't a valid email address.`);
  }
}

export class InvalidNameError extends IdentityError {
  constructor() {
    super("The display name can't be empty, and has at most 255 characters.");
  }
}

export class InvalidPasswordError extends IdentityError {
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
  constructor(readonly email: string) {
    super(`A root account already exists (${email}). Setup never creates another.`);
  }
}

export class RootNotFoundError extends IdentityError {
  constructor() {
    super("There's no root account yet. Run `pnpm run setup` to create one.");
  }
}

/** reset-root-password with several roots and no `--email` (059). */
export class WhichRootError extends IdentityError {
  constructor(readonly count: number) {
    super(`There are ${count} root accounts. Say which with --email.`);
  }
}

/** reset-root-password's `--email` names someone who isn't root: it never promotes (059). */
export class NotARootError extends IdentityError {
  constructor(readonly email: string) {
    super(`${email} isn't a root account.`);
  }
}

export class NotConfiguredError extends IdentityError {
  constructor() {
    super(
      "Ronne AI Marketplace isn't set up yet: there's no DATABASE_URL or AUTH_SECRET. Run `pnpm run setup`.",
    );
  }
}

export class ForbiddenError extends IdentityError {
  constructor(readonly permission: string) {
    super(`You don't have permission to do this (${permission}).`);
  }
}

export class UserNotFoundError extends IdentityError {
  constructor() {
    super("That user doesn't exist.");
  }
}

export class EmailTakenError extends IdentityError {
  constructor(readonly email: string) {
    super(`A user with the email ${email} already exists.`);
  }
}

/** A root acting on their own row: another root changes it (feature 059). */
export class CannotModifySelfError extends IdentityError {
  constructor() {
    super(
      "You can't change your own role or account here. Change your password in Account; another root can change the rest.",
    );
  }
}

/** The change would leave no enabled root, and the instance unmanageable (feature 059). */
export class LastRootError extends IdentityError {
  constructor() {
    super("This would leave the instance without an active root. Make someone else root first.");
  }
}

export class InvalidRoleError extends IdentityError {
  constructor(readonly role: string) {
    super(`"${role}" isn't a role. Use user, moderator or root.`);
  }
}

export class InvalidTokenNameError extends IdentityError {
  constructor() {
    super("A token name needs 1 to 100 characters.");
  }
}

export class InvalidTokenLifetimeError extends IdentityError {
  constructor(readonly value: string) {
    super(`"${value}" isn't a token lifetime. Use 30, 90 or 365 days, or no expiry.`);
  }
}

export class TokenLimitError extends IdentityError {
  constructor(readonly limit: number) {
    super(`You have ${limit} active tokens, the most allowed. Revoke an old token first.`);
  }
}

export class TokenNameTakenError extends IdentityError {
  constructor(readonly tokenName: string) {
    super(`You already have an active token named "${tokenName}".`);
  }
}

export class TokenNotFoundError extends IdentityError {
  constructor() {
    super("That token doesn't exist, or isn't yours.");
  }
}
