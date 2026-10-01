/** One row of the daily totals, by item id (feature 046). */
export type UsageRow = {
  itemId: string;
  day: string;
  version: string;
  tool: string;
  event: string;
  trigger: string;
  outcome: string;
  count: number;
};

/** What recording usage needs from storage. */
export interface UsageRepository {
  /**
   * The published versions of each named item (`@scope/name`), by item id. Names that aren't
   * published here are left out.
   */
  publishedVersions(
    names: readonly string[],
  ): Promise<Map<string, { itemId: string; versions: Set<string> }>>;
  /** Adds each row's count to the stored total, creating the row when it's new. */
  add(rows: readonly UsageRow[]): Promise<void>;
  /** Deletes the totals of days before `day`. */
  deleteBefore(day: string): Promise<void>;
  /** An item's daily totals from `from` to `to`, inclusive (047). */
  rowsBetween(itemId: string, from: string, to: string): Promise<UsageRow[]>;
  /** Whether anything is stored for an item. */
  hasAny(itemId: string): Promise<boolean>;
}
