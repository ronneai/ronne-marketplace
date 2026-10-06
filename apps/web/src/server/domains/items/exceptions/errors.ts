import { NAME_PROBLEM_MESSAGES, type NameProblem } from "@ronneai/core";

/** Errors the items domain raises. Pages turn them into `ERR:` lines. */
export class ItemsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidScopeNameError extends ItemsError {
  constructor(readonly problem: NameProblem) {
    super(`That scope name won't work. ${NAME_PROBLEM_MESSAGES[problem]}`);
  }
}

export class InvalidScopeDescriptionError extends ItemsError {
  constructor() {
    super("A scope's description needs 1 to 300 characters.");
  }
}

export class ScopeNameTakenError extends ItemsError {
  constructor(readonly scopeName: string) {
    super(`The scope @${scopeName} already exists.`);
  }
}

/** The workspace chosen for a new scope doesn't exist (feature 090). */
export class ScopeWorkspaceNotFoundError extends ItemsError {
  constructor() {
    super("That workspace doesn't exist.");
  }
}

export class ScopeNotFoundError extends ItemsError {
  constructor() {
    super("That scope doesn't exist.");
  }
}

/** No published item by that name: never released, or a mistyped name. */
export class ItemNotFoundError extends ItemsError {
  constructor(readonly itemName: string) {
    super(`${itemName} isn't a published item.`);
  }
}

export class VersionNotFoundError extends ItemsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
  ) {
    super(`${itemName} has no version ${version}.`);
  }
}

/** A tag change the rules refuse (version-rules.ts), with the rule's own sentence. */
export class TagRuleError extends ItemsError {}

export class VersionMessageError extends ItemsError {
  constructor(what: string) {
    super(`${what} needs 1 to 300 characters.`);
  }
}

/** A version's stored artifact is missing, or doesn't match its checksum (019). */
export class ArtifactUnavailableError extends ItemsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
  ) {
    super(
      `The package of ${itemName} ${version} can't be served right now. Ask root to check the storage.`,
    );
  }
}
