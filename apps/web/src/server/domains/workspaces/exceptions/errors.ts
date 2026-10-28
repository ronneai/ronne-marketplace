import { NAME_MAX_LENGTH, NAME_PROBLEM_MESSAGES, type NameProblem } from "@ronneai/core";
import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
import type { ItemMoveImpact } from "../models/item-move";
import type { MoveImpact } from "../models/scope-move";

/** Errors the workspaces domain raises (feature 090). Pages turn them into `ERR:` lines. */
export class WorkspacesError extends Error {
  override readonly name: string = "WorkspacesError";
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidWorkspaceNameError extends WorkspacesError {
  override readonly name: string = "InvalidWorkspaceNameError";
  /** The longest name, for the `too_long` problem's sentence in the web app's languages. */
  readonly max: number = NAME_MAX_LENGTH;
  constructor(readonly problem: NameProblem) {
    super(`That workspace name won't work. ${NAME_PROBLEM_MESSAGES[problem]}`);
  }
}

export class InvalidWorkspaceDescriptionError extends WorkspacesError {
  override readonly name: string = "InvalidWorkspaceDescriptionError";
  constructor() {
    super("A workspace's description needs 1 to 300 characters.");
  }
}

/** Until private workspaces (093), every workspace is public. */
export class InvalidWorkspaceVisibilityError extends WorkspacesError {
  override readonly name: string = "InvalidWorkspaceVisibilityError";
  constructor() {
    super("A workspace is public or private.");
  }
}

export class WorkspaceNameTakenError extends WorkspacesError {
  override readonly name: string = "WorkspaceNameTakenError";
  constructor(readonly workspaceName: string) {
    super(`That name is taken: the workspace ${workspaceName} already exists.`);
  }
}

export class WorkspaceNotFoundError extends WorkspacesError {
  override readonly name: string = "WorkspaceNotFoundError";
  constructor() {
    super("That workspace doesn't exist.");
  }
}

/** `global` can't be edited or deleted: every instance has it, and everyone is in it. */
export class GlobalWorkspaceError extends WorkspacesError {
  override readonly name: string = "GlobalWorkspaceError";
  constructor() {
    super("The global workspace can't be changed or deleted.");
  }
}

/** A workspace with scopes stays: nothing moves scopes yet. */
export class WorkspaceNotEmptyError extends WorkspacesError {
  override readonly name: string = "WorkspaceNotEmptyError";
  constructor(readonly scopes: number) {
    super("Move or remove its scopes first.");
  }
}

/** Nobody leaves `global` (092): it's the workspace everyone but root is in. */
export class GlobalMembershipError extends WorkspacesError {
  override readonly name: string = "GlobalMembershipError";
  constructor() {
    super("Nobody leaves global: everyone is in it.");
  }
}

/** Root works in every workspace (091), so root's memberships aren't managed. */
export class RootMembershipError extends WorkspacesError {
  override readonly name: string = "RootMembershipError";
  constructor() {
    super("Root works in every workspace without being a member.");
  }
}

export class MemberUserNotFoundError extends WorkspacesError {
  override readonly name: string = "MemberUserNotFoundError";
  constructor() {
    super("That user doesn't exist.");
  }
}

export class NotAWorkspaceMemberError extends WorkspacesError {
  override readonly name: string = "NotAWorkspaceMemberError";
  constructor(readonly workspace: string) {
    super(`They aren't a member of ${workspace}.`);
  }
}

export class InvalidMemberRoleError extends WorkspacesError {
  override readonly name: string = "InvalidMemberRoleError";
  constructor(readonly role: string) {
    super(`"${role}" isn't a role in a workspace. Use admin, moderator or user.`);
  }
}

/** Nobody changes or removes their own membership (092): another admin or root does. */
export class OwnMembershipError extends WorkspacesError {
  override readonly name: string = "OwnMembershipError";
  constructor() {
    super("You can't change or remove your own membership: another admin or root does.");
  }
}

/**
 * Turning a workspace private while released items outside it depend on its items (093): they
 * would stop installing for people who did nothing. They're listed.
 */
export class WorkspaceHasOutsideDependentsError extends WorkspacesError {
  override readonly name: string = "WorkspaceHasOutsideDependentsError";
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
  override readonly name: string = "AccessRequestNotFoundError";
  constructor() {
    super("That request doesn't exist.");
  }
}

/** Someone else answered or cancelled it first (094): the first decision wins. */
export class AccessRequestAnsweredError extends WorkspacesError {
  override readonly name: string = "AccessRequestAnsweredError";
  constructor() {
    super("Already answered.");
  }
}

export class InvalidAccessRequestTextError extends WorkspacesError {
  override readonly name: string = "InvalidAccessRequestTextError";
  constructor(readonly field: "message" | "reason") {
    super(`A request's ${field} has at most 500 characters.`);
  }
}

/** At most 10 open requests per user (094). */
export class TooManyAccessRequestsError extends WorkspacesError {
  override readonly name: string = "TooManyAccessRequestsError";
  constructor(readonly limit: number) {
    super(`You have ${limit} open requests already. Cancel one, or wait for an answer.`);
  }
}

/** A declined request can be sent again 7 days after the decline (094). */
export class AccessRequestTooSoonError extends WorkspacesError {
  override readonly name: string = "AccessRequestTooSoonError";
  constructor(readonly after: Date) {
    super(
      `Your last request was declined. You can ask again from ${after.toISOString().slice(0, 10)}.`,
    );
  }
}

/** Approving with a role other than user or moderator (094); admin is set from Members (092). */
export class InvalidRequestRoleError extends WorkspacesError {
  override readonly name: string = "InvalidRequestRoleError";
  constructor(readonly role: string) {
    super(`"${role}" can't be given by approving a request. Use user or moderator.`);
  }
}

/**
 * A rename that would give items names other items had (113): an old name stays that item's for
 * good (118). Only when the workspace takes a name another workspace had before.
 */
export class WorkspaceRenameAliasError extends WorkspacesError {
  override readonly name: string = "WorkspaceRenameAliasError";
  /**
   * `names` are the ones the renamer sees; `hidden` counts the rest, items in workspaces they don't
   * see (114: someone's personal one), named to nobody.
   */
  /** All the names, those listed and those hidden: the plural of the sentence. */
  readonly total: number;
  constructor(
    readonly names: readonly string[],
    readonly hidden = 0,
  ) {
    const all = names.length + hidden;
    const listed =
      names.length === 0 ? "" : `: ${names.join(", ")}${hidden > 0 ? `, and ${hidden} more` : ""}`;
    super(
      `Other items had ${all === 1 ? "this name" : "these names"} before, and keep ${all === 1 ? "it" : "them"}${listed}. Choose another name for the workspace.`,
    );
    this.total = all;
  }
}

/**
 * What nobody does to a personal workspace (114), root included: it stays its owner's alone, always
 * private, as long as its owner exists.
 */
export class PersonalWorkspaceError extends WorkspacesError {
  override readonly name: string = "PersonalWorkspaceError";
  constructor(readonly change: "members" | "visibility" | "delete") {
    super(
      change === "members"
        ? "A personal workspace is its owner's alone: nobody else can be added, and its owner's place in it doesn't change."
        : change === "visibility"
          ? "A personal workspace is always private."
          : "A personal workspace stays as long as its owner.",
    );
  }
}

/** A scope to move that doesn't exist, or that the asker doesn't see (115). */
export class ScopeMoveScopeNotFoundError extends WorkspacesError {
  override readonly name: string = "ScopeMoveScopeNotFoundError";
  constructor() {
    super("That scope doesn't exist.");
  }
}

/** Moving a scope to the workspace it's in already (115). */
export class ScopeMoveSameWorkspaceError extends WorkspacesError {
  override readonly name: string = "ScopeMoveSameWorkspaceError";
  constructor(readonly workspaceName: string) {
    super(`The scope is in ${workspaceName} already.`);
  }
}

/** Something refuses the move (115): the checks' result, for the dialog to list. */
export class ScopeMoveRefusedError extends WorkspacesError {
  override readonly name: string = "ScopeMoveRefusedError";
  constructor(readonly impact: MoveImpact) {
    super("This move would break something, listed below. Nothing moved.");
  }
}

/** A move already waiting for an answer for the scope (115). */
export class ScopeMoveOpenError extends WorkspacesError {
  override readonly name: string = "ScopeMoveOpenError";
  constructor(readonly workspaceName: string) {
    super(`A move to ${workspaceName} is waiting for an answer.`);
  }
}

/** A move made at once by root, or to `global` by its admins, confirms with the scope's name (115). */
export class ScopeMoveConfirmationError extends WorkspacesError {
  override readonly name: string = "ScopeMoveConfirmationError";
  constructor(readonly scopeName: string) {
    super(`Type the scope's name, ${scopeName}, to confirm the move.`);
  }
}

export class ScopeMoveNotFoundError extends WorkspacesError {
  override readonly name: string = "ScopeMoveNotFoundError";
  constructor() {
    super("That move request doesn't exist.");
  }
}

/** Answered or cancelled already (115): the first answer counts. */
export class ScopeMoveAnsweredError extends WorkspacesError {
  override readonly name: string = "ScopeMoveAnsweredError";
  constructor() {
    super("Already answered.");
  }
}

/** The asker is no longer root or an admin of the scope's workspace (115): the request was closed. */
export class ScopeMoveAskerLostRoleError extends WorkspacesError {
  override readonly name: string = "ScopeMoveAskerLostRoleError";
  constructor() {
    super(
      "Whoever asked can no longer move this scope, so the request was cancelled. Nothing moved.",
    );
  }
}

/** A move's message or a decline's reason: at most 500 characters (115). */
export class InvalidScopeMoveTextError extends WorkspacesError {
  override readonly name: string = "InvalidScopeMoveTextError";
  constructor(readonly field: "message" | "reason") {
    super(`A move's ${field} has at most 500 characters.`);
  }
}

/** An item the asker can't move, or one that isn't there (134): never told apart. */
export class ItemMoveItemNotFoundError extends WorkspacesError {
  override readonly name: string = "ItemMoveItemNotFoundError";
  constructor() {
    super("That item doesn't exist.");
  }
}

/** A target that isn't another scope of the item's workspace (134). */
export class ItemMoveScopeNotFoundError extends WorkspacesError {
  override readonly name: string = "ItemMoveScopeNotFoundError";
  constructor() {
    super("That scope isn't in the item's workspace.");
  }
}

/** Moving an item to the scope it's in already (134). */
export class ItemMoveSameScopeError extends WorkspacesError {
  override readonly name: string = "ItemMoveSameScopeError";
  constructor(readonly scopeName: string) {
    super(`The item is in ${scopeName} already.`);
  }
}

/** The new name is taken (134): the checks' result, for the dialog to say why. */
export class ItemMoveRefusedError extends WorkspacesError {
  override readonly name: string = "ItemMoveRefusedError";
  /** The name that's taken, for the message in the web app's languages. */
  readonly newName: string;
  constructor(readonly impact: ItemMoveImpact) {
    super(`${impact.newName} is taken, so the item can't move there. Nothing moved.`);
    this.newName = impact.newName;
  }
}

/** A move already waiting for an answer for the item (134). */
export class ItemMoveOpenError extends WorkspacesError {
  override readonly name: string = "ItemMoveOpenError";
  constructor(readonly scopeName: string) {
    super(`A move to ${scopeName} is waiting for an answer.`);
  }
}

/** A move request that isn't there, or that the person can't answer or cancel (134). */
export class ItemMoveNotFoundError extends WorkspacesError {
  override readonly name: string = "ItemMoveNotFoundError";
  constructor() {
    super("That move request doesn't exist.");
  }
}

/** A move request answered or cancelled already (134). */
export class ItemMoveAnsweredError extends WorkspacesError {
  override readonly name: string = "ItemMoveAnsweredError";
  constructor() {
    super("Already answered.");
  }
}

/** Approving found the asker no longer in the item's workspace: the request was cancelled (134). */
export class ItemMoveAskerLostRoleError extends WorkspacesError {
  override readonly name: string = "ItemMoveAskerLostRoleError";
  constructor() {
    super("Whoever asked is no longer in the item's workspace, so the request was cancelled.");
  }
}

/** Approving found the item or its target in different workspaces now: the request was cancelled (134). */
export class ItemMoveTargetMovedError extends WorkspacesError {
  override readonly name: string = "ItemMoveTargetMovedError";
  constructor(readonly scopeName: string) {
    super(`${scopeName} is now in another workspace than the item, so the request was cancelled.`);
  }
}

/** A message or decline reason too long, or with a NUL (134). */
export class InvalidItemMoveTextError extends WorkspacesError {
  override readonly name: string = "InvalidItemMoveTextError";
  constructor(readonly field: "message" | "reason") {
    super(`A move's ${field} has at most 500 characters.`);
  }
}
