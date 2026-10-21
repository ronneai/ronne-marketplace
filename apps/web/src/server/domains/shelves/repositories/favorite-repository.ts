import type { Favorite, FavoriteOutcome } from "../models/shelf";

/**
 * A person's favorites (feature 125). Kysely in kysely-favorite-repository.ts. Ids are taken in any
 * case. The person and the item must exist: the service checks first, and a missing one is the
 * database's foreign key error, not an outcome.
 */
export interface FavoriteRepository {
  /** Adds one: "exists" if it already is (nothing changes), "full" at the person's limit. */
  add(userId: string, itemId: string, at: Date, limit: number): Promise<FavoriteOutcome>;
  /** Removes one; false when it wasn't there. */
  remove(userId: string, itemId: string): Promise<boolean>;
  has(userId: string, itemId: string): Promise<boolean>;
  /** The person's favorites, newest first (at most the limit, so all of them). */
  list(userId: string): Promise<Favorite[]>;
  count(userId: string): Promise<number>;
  /** Of these items, the ones the person has favorited. */
  among(userId: string, itemIds: string[]): Promise<string[]>;
  /** Deletes all of a person's favorites (erasing, 103); how many. */
  removeAll(userId: string): Promise<number>;
}
