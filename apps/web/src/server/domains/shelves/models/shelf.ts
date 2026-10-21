/** Pins and favorites (feature 125). */

/** The most items a person can favorite. */
export const MAX_FAVORITES = 200;

/** The most items on one pin shelf: the instance's "Start here", or a workspace's. */
export const MAX_PINS = 12;

/**
 * An id in its canonical form (ULIDs are uppercase). MySQL and MariaDB compare ids without regard to
 * case, so an id in another case would pass their filters and fail a comparison made here; every
 * id the repositories take goes through this first.
 */
export const canonicalId = (id: string): string => id.trim().toUpperCase();

/** A pin shelf: the instance's ("Start here", root's) or one workspace's (its admins'). */
export type Shelf = { kind: "instance" } | { kind: "workspace"; workspaceId: string };

export const INSTANCE_SHELF: Shelf = { kind: "instance" };

/**
 * The shelf as a key. A ULID is 26 characters of Crockford's base 32 (no `I`, `L`, `O` or `U`), so
 * `instance` can't be a workspace's id.
 */
export const shelfKey = (shelf: Shelf): string =>
  shelf.kind === "instance" ? "instance" : canonicalId(shelf.workspaceId);

export type Favorite = { itemId: string; createdAt: Date };

export type Pin = {
  id: string;
  itemId: string;
  /** 1, 2, 3… on its shelf. */
  position: number;
  createdBy: string | null;
  createdAt: Date;
};

export type FavoriteOutcome = "added" | "exists" | "full";
export type PinOutcome = "added" | "exists" | "full";
export type MoveOutcome = "moved" | "edge" | "missing";
