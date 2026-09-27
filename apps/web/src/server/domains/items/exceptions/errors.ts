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

export class ScopeNotFoundError extends ItemsError {
  constructor() {
    super("That scope doesn't exist.");
  }
}
