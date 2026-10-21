import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";

/** Errors the pins and favorites raise (feature 125). Pages turn them into `ERR:` lines. */
export class ShelvesError extends Error {
  override readonly name: string = "ShelvesError";
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

/** The item doesn't exist, isn't released, has no installable version, or the person can't see it. */
export class ShelfItemNotAvailableError extends ShelvesError {
  override readonly name: string = "ShelfItemNotAvailableError";
  constructor() {
    super("That item isn't available.");
  }
}

export class FavoriteLimitError extends ShelvesError {
  override readonly name: string = "FavoriteLimitError";
  constructor(readonly max: number) {
    super(`You have ${max} favorites, the most allowed. Remove one first.`);
  }
}

/**
 * A shelf is full. `workspace` is the workspace's name, or null for the instance's "Start here";
 * `shelf` and `workspaceName` say the same in plain fields, which a translated message can use.
 */
export class PinLimitError extends ShelvesError {
  override readonly name: string = "PinLimitError";
  readonly shelf: "instance" | "workspace";
  readonly workspaceName: string;
  constructor(
    readonly workspace: string | null,
    readonly max: number,
  ) {
    super(
      workspace === null
        ? `Start here has ${max} items; remove one first.`
        : `The pins of ${workspace} have ${max} items; remove one first.`,
    );
    this.shelf = workspace === null ? "instance" : "workspace";
    this.workspaceName = workspace ?? "";
  }
}

/** Only items in a public workspace can go on the instance's shelf: everyone sees it. */
export class PinNeedsPublicWorkspaceError extends ShelvesError {
  override readonly name: string = "PinNeedsPublicWorkspaceError";
  constructor() {
    super("Only items in a public workspace can be pinned to Start here.");
  }
}
