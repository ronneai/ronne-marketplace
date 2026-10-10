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
    super("A workspace is public or private.");
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

/** Nobody leaves `global` (092): it's the workspace everyone but root is in. */
export class GlobalMembershipError extends WorkspacesError {
  constructor() {
    super("Nobody leaves global: everyone is in it.");
  }
}

/** Root works in every workspace (091), so root's memberships aren't managed. */
export class RootMembershipError extends WorkspacesError {
  constructor() {
    super("Root works in every workspace without being a member.");
  }
}

export class MemberUserNotFoundError extends WorkspacesError {
  constructor() {
    super("That user doesn't exist.");
  }
}

export class NotAWorkspaceMemberError extends WorkspacesError {
  constructor(readonly workspace: string) {
    super(`They aren't a member of ${workspace}.`);
  }
}

export class InvalidMemberRoleError extends WorkspacesError {
  constructor(readonly role: string) {
    super(`"${role}" isn't a role in a workspace. Use admin, moderator or user.`);
  }
}

/** Nobody changes or removes their own membership (092): another admin or root does. */
export class OwnMembershipError extends WorkspacesError {
  constructor() {
    super("You can't change or remove your own membership: another admin or root does.");
  }
}

/**
 * Turning a workspace private while released items outside it depend on its items (093): they
 * would stop installing for people who did nothing. They're listed.
 */
export class WorkspaceHasOutsideDependentsError extends WorkspacesError {
  constructor(
    readonly workspace: string,
    readonly dependents: readonly string[],
  ) {
    super(
      `${dependents.length} ${dependents.length === 1 ? "item" : "items"} outside ${workspace} ${dependents.length === 1 ? "depends" : "depend"} on its items: ${dependents.join(", ")}. A private workspace's items can only be dependencies of its own.`,
    );
  }
}

/** A request to join (094) that doesn't exist, or isn't the asker's to see. */
export class AccessRequestNotFoundError extends WorkspacesError {
  constructor() {
    super("That request doesn't exist.");
  }
}

/** Someone else answered or cancelled it first (094): the first decision wins. */
export class AccessRequestAnsweredError extends WorkspacesError {
  constructor() {
    super("Already answered.");
  }
}

export class InvalidAccessRequestTextError extends WorkspacesError {
  constructor(readonly field: "message" | "reason") {
    super(`A request's ${field} has at most 500 characters.`);
  }
}

/** At most 10 open requests per user (094). */
export class TooManyAccessRequestsError extends WorkspacesError {
  constructor(readonly limit: number) {
    super(`You have ${limit} open requests already. Cancel one, or wait for an answer.`);
  }
}

/** A declined request can be sent again 7 days after the decline (094). */
export class AccessRequestTooSoonError extends WorkspacesError {
  constructor(readonly after: Date) {
    super(
      `Your last request was declined. You can ask again from ${after.toISOString().slice(0, 10)}.`,
    );
  }
}

/** Approving with a role other than user or moderator (094); admin is set from Members (092). */
export class InvalidRequestRoleError extends WorkspacesError {
  constructor(readonly role: string) {
    super(`"${role}" can't be given by approving a request. Use user or moderator.`);
  }
}
