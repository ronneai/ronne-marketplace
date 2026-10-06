import { NAME_PROBLEM_MESSAGES, type NameProblem } from "@ronneai/core";

/** Errors the workspaces domain raises (feature 090). Pages turn them into `ERR:` lines. */
export class WorkspacesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidWorkspaceNameError extends WorkspacesError {
  constructor(readonly problem: NameProblem) {
    super(`That workspace name won't work. ${NAME_PROBLEM_MESSAGES[problem]}`);
  }
}

export class InvalidWorkspaceDescriptionError extends WorkspacesError {
  constructor() {
    super("A workspace's description needs 1 to 300 characters.");
  }
}

/** Until private workspaces (093), every workspace is public. */
export class InvalidWorkspaceVisibilityError extends WorkspacesError {
  constructor() {
    super("Workspaces are public for now.");
  }
}

export class WorkspaceNameTakenError extends WorkspacesError {
  constructor(readonly workspaceName: string) {
    super(`That name is taken: the workspace ${workspaceName} already exists.`);
  }
}

export class WorkspaceNotFoundError extends WorkspacesError {
  constructor() {
    super("That workspace doesn't exist.");
  }
}

/** `global` can't be edited or deleted: every instance has it, and everyone is in it. */
export class GlobalWorkspaceError extends WorkspacesError {
  constructor() {
    super("The global workspace can't be changed or deleted.");
  }
}

/** A workspace with scopes stays: nothing moves scopes yet. */
export class WorkspaceNotEmptyError extends WorkspacesError {
  constructor(readonly scopes: number) {
    super("Move or remove its scopes first.");
  }
}
