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
