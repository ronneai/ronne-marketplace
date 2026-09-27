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
    super(`A root account already exists (${email}). Setup never creates a second one.`);
  }
}

export class RootNotFoundError extends IdentityError {
  constructor() {
    super("There's no root account yet. Run `pnpm run setup` to create one.");
  }
}

export class NotConfiguredError extends IdentityError {
  constructor() {
    super("Ronne isn't set up yet: there's no DATABASE_URL or AUTH_SECRET. Run `pnpm run setup`.");
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

export class CannotModifyRootError extends IdentityError {
  constructor() {
    super(
      "Root can't be changed from the admin area. Root changes its own password in Account, and recovers with `pnpm run reset-root-password`.",
    );
  }
}

export class InvalidRoleError extends IdentityError {
  constructor(readonly role: string) {
    super(`"${role}" isn't a role that can be given here. Use user or moderator.`);
  }
}
